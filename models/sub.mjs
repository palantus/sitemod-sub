import Entity, {query} from "entitystorage"
import LogEntry from "../../../models/logentry.mjs"
import { checkCreateSub, deleteSubFiles, getRuntimeInfo, startProcess, stopProcess } from "../services/handler.mjs"
import Remote from "../../../models/remote.mjs"
import MenuItem from "../../../models/menuitem.mjs"
import { generateMenu } from "../../../services/menu.mjs";

export default class Sub extends Entity {
  initNew(id, title) {
    this.id = id
    this.title = title
    this.tag("sub")
  }

  static lookup(id) {
    if(!id) return null;
    return query.type(Sub).prop("id", id).tag("sub").first
  }

  static all(){
    return query.type(Sub).tag("sub").all
  }

  async start(user){
    if(this.status != "stopped") return this.log("Cannot start a sub that is not stopped")
    this.clearLog();
    this.log("Starting sub")
    await checkCreateSub(this, user)
    await startProcess(this, user)
  }

  async stop(user){
    if(this.status == "stopped") return this.log("Cannot start a sub that is already stopped")
    this.log("Stopping sub", user)
    await stopProcess(this)
  }

  log(text){
    let entry = new LogEntry(text, "sub");
    this.rel(entry, "log");
    console.log(text)
  }

  clearLog(){
    this.logEntries.forEach(l => l.delete())
  }

  get logEntries(){
    return this.rels.log?.map(e => LogEntry.from(e))||[]
  }

  patch(obj, user){
    if(typeof obj.title === "string" && obj.title) this.title = obj.title;
    if(typeof obj.autoStart === "boolean") this.autoStart = obj.autoStart;
    if(typeof obj.showInMenu === "boolean") {
      this.showInMenu = obj.showInMenu;
      this.refreshMenuFromSetup(user);
    }
    if(typeof obj.fixedPort === "number" || obj.fixedPort === null) this.fixedPort = obj.fixedPort;
  }

  refreshMenuFromSetup(user){
    let mi = this.menuItem;
    if(this.showInMenu){
      if(mi) {
        mi.title = this.title;
        return;
      }
      mi = new MenuItem(this.title, "/Subs", `/_${this.id}`)
      this.rel(mi, "menuitem")
    } else {
      mi?.delete();
    }
    generateMenu();
  }

  get status(){
    return getRuntimeInfo(this) ? "started" : "stopped"
  }

  get remote(){
    return Remote.from(this.related.remote) || null;
  }

  get menuItem(){
    return MenuItem.from(this.related.menuitem)
  }

  delete(){
    deleteSubFiles(this)
    this.remote?.delete();
    super.delete();
  }

  toObj() {
    return {
      id: this.id,
      title: this.title,
      status: this.status,
      autoStart: !!this.autoStart,
      showInMenu: !!this.showInMenu,
      fixedPort: this.fixedPort || null,
      runtimeInfo: getRuntimeInfo(this)
    }
  }

  toObjFull() {
    return {
      ...this.toObj(),
      log: this.logEntries.map(e => e.toObj())
    }
  }
}