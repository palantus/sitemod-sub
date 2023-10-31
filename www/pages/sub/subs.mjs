const elementName = 'subs-page'

import api from "../../system/api.mjs"
import "../../components/action-bar.mjs"
import "../../components/action-bar-item.mjs"
import "../../components/field-ref.mjs"
import "../../components/field-edit.mjs"
import {on, off} from "../../system/events.mjs"
import {siteURL} from "../../system/core.mjs"
import {showDialog, alertDialog, confirmDialog} from "../../components/dialog.mjs"

const template = document.createElement('template');
template.innerHTML = `
  <link rel='stylesheet' href='../css/global.css'>
  <link rel='stylesheet' href='../css/searchresults.css'>
  <style>
    #container{
      position: relative;
      padding: 10px;
    }
    table{
      width: 100%;
    }
    table thead tr{
      border-bottom: 1px solid gray;
    }

    table thead th:nth-child(1){width: 80px}
    table thead th:nth-child(2){width: 150px}
    table thead th:nth-child(3){width: 75px}
    table thead th:nth-child(4){width: 270px}

    tr span.status.stopped{color: red;}
    tr span.status.running{color: green;}

    .hidden{display:none !important;}
  </style>  

  <action-bar>
      <action-bar-item id="refresh-btn">Refresh</action-bar-item>
      <action-bar-item id="new-btn">New sub</action-bar-item>
  </action-bar>

  <div id="container">
    <table>
        <thead>
            <tr>
              <th>Id</th>
              <th>Title</th>
              <th>Status</th>
              <th>Actions</th>
              <th>Port</th>
            </tr>
        </thead>
        <tbody id="subs">
        </tbody>
    </table>
  </div>

  <dialog-component title="New sub" id="new-dialog">
    <field-component label="Id"><input id="new-id"></input></field-component>
    <field-component label="Name"><input id="new-title"></input></field-component>
  </dialog-component>
`;

class Element extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.refreshData = this.refreshData.bind(this);
    this.newSub = this.newSub.bind(this);
    this.tableClick = this.tableClick.bind(this);
    
    this.shadowRoot.getElementById("new-btn").addEventListener("click", this.newSub)
    this.shadowRoot.getElementById("refresh-btn").addEventListener("click", this.refreshData)
    this.shadowRoot.getElementById("subs").addEventListener("click", this.tableClick)
  }
  async refreshData(){
    this.subs = await api.get("sub")

    this.shadowRoot.getElementById('subs').innerHTML = this.subs.sort((a, b) => a.name?.toLowerCase() < b.name?.toLowerCase() ? -1 : 1)
                                                                      .map(c => `
      <tr class="result" data-id="${c.id}">
        <td><field-ref ref="/sub/${c.id}">${c.id}</field-ref></td>
        <td>${c.title}</td>
        <td><span class="status ${c.status}">${c.status}</span></td>
        <td>
          <button class="styled stopstart ${c.status == "stopped" ? "start" : "stop"}">${c.status == "stopped" ? "Start" : "Stop"}</button>
          <button class="styled goto${c.status != "started" ? " hidden" : ""}">Goto</button>
          <button class="styled delete${c.status != "stopped" ? " hidden" : ""}">Delete</button>
          <button class="styled adminpass${c.status != "stopped" ? "" : " hidden"}">Copy password</button>
          <button class="styled admintoken${c.status != "stopped" ? "" : " hidden"}">Copy token</button>
        </td>
        <td>${c.runtimeInfo?.port||""}</td>
      </tr>`).join('');
  }

  async newSub(){
    let dialog = this.shadowRoot.querySelector("#new-dialog")

    showDialog(dialog, {
      show: () => this.shadowRoot.getElementById("new-id").focus(),
      ok: async (val) => {
        await api.post("sub", val)
        this.refreshData()
      },
      validate: (val) => 
          !val.id ? "Please fill out id"
        : !val.title ? "Please fill out title"
        : true,
      values: () => {return {
        id: this.shadowRoot.getElementById("new-id").value,
        title: this.shadowRoot.getElementById("new-title").value
      }},
      close: () => {
        this.shadowRoot.querySelectorAll("field-component input").forEach(e => e.value = '')
      }
    })
  }

  async tableClick(e){
    if(e.target.tagName !== "BUTTON") return;
    let id = e.target.closest("tr").getAttribute("data-id")
    let sub = this.subs.find(s => s.id == id)
    if(e.target.classList.contains("start")){
      await this.refreshData()
      this.lastSubsJSON = JSON.stringify(this.subs);
      await api.post(`sub/${id}/start`)
      while(true){
        await new Promise(resolve => setTimeout(resolve, 1000))
        await this.refreshData();
        if(JSON.stringify(this.subs) != this.lastSubsJSON) break;
      }
    } else if(e.target.classList.contains("stop")){
      await api.post(`sub/${id}/stop`)
      await this.refreshData();
    } else if(e.target.classList.contains("goto")){
      window.open(`${siteURL()}/_${id}`, "_blank")
    } else if(e.target.classList.contains("delete")){
      if(!(await confirmDialog(`Are you sure that you want to delete sub ${id}?`))) return;
      await api.del(`sub/${id}`);
      await this.refreshData();
    } else if(e.target.classList.contains("adminpass")){
      let pass = await api.get(`sub/${id}/adminpass`);
      navigator.clipboard.writeText(pass)
    } else if(e.target.classList.contains("admintoken")){
      let pass = await api.get(`sub/${id}/admintoken`);
      navigator.clipboard.writeText(pass)
    }
  }

  connectedCallback() {
    on("changed-page", elementName, this.refreshData)
  }

  disconnectedCallback() {
    off("changed-page", elementName)
  }
}

window.customElements.define(elementName, Element);
export {Element, elementName as name}