import Sub from "./models/sub.mjs"

export default async () => {
  startSubs(); // Don't wait for this
  return {}
}

async function startSubs(){
  for(let sub of Sub.all()){
    if(!sub.autoStart) continue;
    await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between starts to not slow down server
    await sub.start();
  }
}