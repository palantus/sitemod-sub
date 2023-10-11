let processes = []

import { join, dirname } from 'path';
import { unzipSync } from 'fflate';
import { mkdirp } from 'mkdirp'
import fs, {rm, promises as fsp} from "fs"
import child_process from "child_process"
import dotenv from "dotenv"
import net from "net"
import Remote from '../../../models/remote.mjs';
import { uuidv4 } from '../../../www/libs/uuid.mjs';
import Setup from '../../../models/setup.mjs';
import WebSocket from 'ws';
import { sendEvent } from '../../../services/clientevents.mjs';

export async function checkCreateSub(sub, user) {
  try {
    let subsPath = join(global.sitecore.storagePath, 'subs')
    try {
      await fsp.stat(subsPath)
    } catch (err) {
      sub.log(`Creating folder for subs: ${subsPath}`)
      await fsp.mkdir(subsPath)
    }
    let subPath = join(global.sitecore.storagePath, 'subs', sub.id)
    try {
      await fsp.stat(subPath)
    } catch (err) {
      sub.log(`Creating folder for this sub: ${subPath}`)
      await fsp.mkdir(subPath)
      await initNewSubFolder(sub, subPath)
    }
  } catch (err) { console.log(err) }

  await checkSetup(sub)

  sub.log(`Sub ${sub.id} ready to run`)
}

export async function initNewSubFolder(sub, path) {
  sub.log(`Installing sitecore`)
  try {
    let zipBuffer = await (await fetch(`https://api.github.com/repos/palantus/sitecore/zipball`)).arrayBuffer()

    let destPath = path;
    let zipUInt = new Uint8Array(zipBuffer);
    let decompressed = unzipSync(zipUInt)

    for (let [relativePath, content] of Object.entries(decompressed)) {
      if (relativePath.endsWith("/")) continue;
      let relPath = relativePath.split("/").slice(1).join("/")
      var outf = join(destPath, relPath);
      mkdirp.sync(dirname(outf));
      fs.writeFileSync(outf, content);
    }

    await new Promise(resolve => {
      sub.log("Running npm install...")
      child_process.exec('npm install', { cwd: path }, function (err, out) {
        console.log(out); err && sub.log(err);
        sub.log("npm install done")
        resolve();
      });
    })
  } catch (err) {
    sub.log(err)
    throw "Failed to install sitecore"
  }
}

export async function deleteSubFiles(sub){
  let subPath = join(global.sitecore.storagePath, 'subs', sub.id)
  try{await fsp.rm(subPath, {recursive: true});}catch(err){};
}

async function checkSetup(sub){
  let subPath = join(global.sitecore.storagePath, 'subs', sub.id)
  let env = dotenv.config({path: join(subPath, ".env")})
  let config = env.parsed
  // Do checks
}

export function getRuntimeInfo(sub){
  let process = processes.find(p => p.sub.id == sub.id)
  if(!process) return null;
  return {port: process.port}
}

export async function startProcess(sub, user) {
  let port = await getPortFree()
  sub.log(`Staring process on port ${port}`)
  
  let subPath = join(global.sitecore.storagePath, 'subs', sub.id)
  let child = child_process.spawn(`node`, [join(subPath, "server.mjs"), `--port=${port}`], { cwd: subPath, env: {} });
  child.on('close', (code, signal) => {
    sub.log(`child process terminated due to receipt of signal ${signal} and code ${code}`);
    if(code === 0){
      sub.log("Due to an exit code of 0, the process is restarted after 500ms...");
      setTimeout(() => startProcess(sub, user), 500)
    }
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (data) => sub.log(`${sub.id}: ${data}`));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (data) => sub.log(`${sub.id}: ${data}`));

  let process = {sub, child, port}
  processes.push(process)

  sub.log("Waiting for api to become available")
  let curIterations = 0;
  waiter: while(true){
    await new Promise(resolve => setTimeout(resolve, 500));
    try{
      await fetch(`http://localhost:${port}/api/system/ip`)
      break waiter;
    } catch{}
    sub.log("Still not online...")
    curIterations++;
    if(curIterations > 200){
      sub.log("Giving up.")
      await stopProcess(sub)
      return;
    }
  }
  sub.log("API ready")

  if(!sub.remote){
    sub.log("Beginning initial configuration by logging in...")
    await initRemoteSetup(sub, port, user)
    sub.log("Done with initial configuration")
  }
  sub.remote.url = `http://localhost:${port}/api`
  sub.remote.siteURL = `http://localhost:${port}`

  process.ws = startWebsocketClient(sub, port)
}

async function initRemoteSetup(sub, port, user){
  let res = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({username: "admin", password: "admin"}),
    headers: {
      'Content-Type': "application/json"
    }
  })
  let tempToken = (await res.json()).token;
  sub.log(`Got token: ${tempToken}`)
  
  let key = uuidv4();
  sub.log(`Attempting to set key ${key} as api-key on sub`)
  let masterIdentifier = Setup.lookup().identifier;
  if(!masterIdentifier) return sub.log("Error: Missing identifier on master (set in System -> Federation)")
  res = await fetch(`http://localhost:${port}/api/system/apikeys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tempToken}`,
      'Content-Type': "application/json"
    },
    body: JSON.stringify({name: "master", key, userId: "admin", federation: true, identifier: masterIdentifier})
  })

  sub.log("Creating remote...")
  let remote = Remote.lookupIdentifier(sub.id);
  if(remote){
    remote.apiKey = key;
    remote.url = `http://localhost:${port}/api`
  } else {
    remote = new Remote({title: sub.id, apiKey: key, url: `http://localhost:${port}/api`} )
  }
  sub.rel(remote, "remote", true)

  sub.log("Setting identifier for federation...")
  await fetch(`http://localhost:${port}/api/federation/setup`, {
    method: "PATCH",
    body: JSON.stringify({identifier: sub.id}),
    headers: {
      Authorization: `Bearer ${tempToken}`,
      'Content-Type': "application/json"
    }
  })
  await remote.refresh();

  sub.log("Setting your user as admin on sub...")
  let me = await remote.get("me", {user})
  sub.log(`User id on sub: ${me.id}`)
  await fetch(`http://localhost:${port}/api/user/${me.id}/roles`, {
    method: "POST",
    body: JSON.stringify({id: "admin"}),
    headers: {
      Authorization: `Bearer ${tempToken}`,
      'Content-Type': "application/json"
    }
  })

  sub.adminPass = uuidv4()
  sub.log(`Setting new admin password "${sub.adminPass}"...`)
  await remote.post("me/changepass", {existingPass: "admin", newPass: sub.adminPass})


}

export async function stopProcess(sub) {
  console.log("stopping process")
  let process = processes.find(p => p.sub.id == sub.id)
  if(!process) return sub.log("Process not found, so it cannot be stopped");
  process.child.kill('SIGHUP'); 
  process.ws?.terminate()
  processes = processes.filter(p => p.sub.id != sub.id)
}

async function getPortFree() {
  return new Promise( res => {
      const srv = net.createServer();
      srv.listen(0, () => {
          const port = srv.address().port
          srv.close((err) => res(port))
      });
  })
}

function startWebsocketClient(sub, port){
  const ws = new WebSocket(`ws://localhost:${port}/api`);
  ws.on('error', err => sub.log(`Error: ${err}`));
  ws.on('open', function open(){
    sub.log("Websocket client connected")
    ws.send(JSON.stringify({type: "login", content: {token: sub.remote?.apiKey}}))
  });
  ws.on('message', function message(data) {
    data = JSON.parse(data);
    if(data.type != "forward") return;
    if(data.content.type == "event"){
      sendEvent(data.recipient, data.content.content.name, data.content.content.data, sub.remote?.identifier)
    } else if(data.content.type == "message"){
      sendEvent(data.recipient, data.content.content.message, data.content.content.args, sub.remote?.identifier)
    }
  });
  return ws;
}