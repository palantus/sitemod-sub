const elementName = 'sub-page'

import {state, goto} from "../../system/core.mjs"
import api from "../../system/api.mjs"
import "../../components/field-edit.mjs"
import "../../components/field-ref.mjs"
import "../../components/field-list.mjs"
import "../../components/action-bar.mjs"
import "../../components/action-bar-item.mjs"
import "../../components/collapsible-card.mjs"
import "../../components/field-edit-inline.mjs"
import { alertDialog, confirmDialog, showDialog } from "../../components/dialog.mjs"

const template = document.createElement('template');
template.innerHTML = `

  <link rel='stylesheet' href='../css/global.css'>
  <link rel='stylesheet' href='../css/searchresults.css'>
  <style>
    #container{
      padding: 10px;
    }
    field-list{
      width: 300px;
    }
    h3{margin-top: 20px;}
    .subheader{text-decoration: underline;}

    #licensestab td, #licensestab th{
      padding-right: 5px;
    }
    #add-license{
      margin-bottom: 5px;
    }
    #create-portal-user-btn{
      margin-top: 10px;
    }
    collapsible-card > div{
      padding: 10px;
    }
    collapsible-card{
      margin-bottom: 10px;
      display: block;
    }
    #log-tab{width: 100%;}
    #log-tab th:nth-child(1){width: 150px;}
  </style>

  <action-bar>
      <action-bar-item id="refresh-btn">Refresh</action-bar-item>
  </action-bar>
    
  <div id="container">
    <h2><span id="sub-title"></span></h2>

    <field-list labels-pct="35">
      <field-edit type="text" label="Id" id="id" disabled></field-edit>
      <field-edit type="text" label="Title" id="title"></field-edit>
      <field-edit type="checkbox" label="Auto-start" id="autoStart"></field-edit>
      <field-edit type="checkbox" label="Show in menu" id="showInMenu"></field-edit>
      <field-edit type="number" label="Fixed port" id="fixedPort" title="Runs the sub on a specific port every time"></field-edit>
    </field-list>
    <br>

    <collapsible-card open>
      <span slot="title">Log</span>
      <div>
        <table id="log-tab">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody id="log">
          </tbody>
        </table>
      </div>
    </collapsible-card>
`;

class Element extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.refreshData = this.refreshData.bind(this)
    this.refreshLog = this.refreshLog.bind(this)

    this.shadowRoot.getElementById("refresh-btn").addEventListener("click", this.refreshData)
    
    this.subId = state().path.split("/")[2]
  }

  async refreshData(){
    this.sub = await api.get(`sub/${this.subId}`)
    
    if(!this.sub){
      alertDialog("Unknown sub")
      return;
    }
    this.shadowRoot.getElementById("sub-title").innerText = this.sub.title

    this.shadowRoot.getElementById('id').setAttribute("value", this.sub.id)
    this.shadowRoot.getElementById('title').setAttribute("value", this.sub.title || "N/A")
    this.shadowRoot.getElementById('autoStart').setAttribute("value", this.sub.autoStart)
    this.shadowRoot.getElementById('showInMenu').setAttribute("value", this.sub.showInMenu)
    this.shadowRoot.getElementById('fixedPort').setAttribute("value", this.sub.fixedPort || "")

    this.shadowRoot.querySelectorAll("field-edit:not([disabled])").forEach(e => e.setAttribute("patch", `sub/${this.subId}`));

    this.refreshLog();
  }

  async refreshLog(){
    let log = await api.get(`sub/${this.subId}/log`)
    this.shadowRoot.getElementById("log").innerHTML = log.sort((a, b) => a.timestamp < b.timestamp ? 1 : -1).map(l => `
                  <tr class="result">
                    <td>${l.timestamp.substring(0, 19).replace("T", " ")}</td>
                    <td>${l.text}</td>
                  </tr>`).join("")
  }
  
  connectedCallback() {
    this.refreshData();
    this.refreshInterval = setInterval(this.refreshLog, 3000)
  }

  disconnectedCallback() {
    clearInterval(this.refreshInterval)
  }

}

window.customElements.define(elementName, Element);
export {Element, elementName as name}