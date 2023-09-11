import express from "express"
import Sub from "../../models/sub.mjs";
import { lookupType, noGuest, permission } from "../../../../services/auth.mjs"

const { Router, Request, Response } = express;
const route = Router();

export default (apiRoute, app) => {

  const route = Router();
  apiRoute.use("/sub", route)

  route.get('/', permission("sub.read"), (req, res) => {
    res.json(Sub.all().map(sub => sub.toObj()))
  });

  route.post("/", permission("sub.edit"), (req, res) => {
    let id = req.body.id
    if(!req.body.id || typeof req.body.id !== "string" || !new RegExp(/^[a-zA-Z0-9_-]+$/).test(req.body.id)) throw "Invalid id (only letters, numbers and -_ are allowed)";
    if(Sub.lookup(req.body.id)) throw "Sub already exists";
    let title = (typeof req.body.title === "string" && req.body.title) ? req.body.title : "New sub"
    let sub = new Sub(id, title)
    res.json(sub.toObj())
  })

  route.patch("/:id", permission("sub.edit"), lookupType(Sub, "sub"), (req, res) => {
    res.locals.sub.patch(req.body)
    res.json(res.locals.sub.toObj())
  })

  route.delete("/:id", permission("sub.edit"), lookupType(Sub, "sub"), (req, res) => {
    res.locals.sub.delete();
    res.json({success: true})
  })

  route.post("/:id/start", permission("sub.manage"), lookupType(Sub, "sub"), (req, res) => {
    res.locals.sub.start(res.locals.user);
    res.json({success: true})
  })

  route.post("/:id/stop", permission("sub.manage"), lookupType(Sub, "sub"), (req, res) => {
    res.locals.sub.stop(res.locals.user);
    res.json({success: true})
  })

  route.get("/:id/log", permission("sub.manage"), lookupType(Sub, "sub"), (req, res) => {
    res.json(res.locals.sub.logEntries.map(e => e.toObj()))
  })

  route.get("/:id/adminpass", permission("sub.manage"), lookupType(Sub, "sub"), (req, res) => {
    res.json(res.locals.sub.adminPass)
  })

  route.get("/:id", permission("sub.manage"), lookupType(Sub, "sub"), (req, res) => {
    res.json(res.locals.sub.toObjFull())
  })
};