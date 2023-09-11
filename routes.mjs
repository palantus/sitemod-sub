routes.push(...[
  {path: "/sub",                 page: "/pages/sub/subs.mjs"},
  {path: "/sub/setup",           page: "/pages/sub/setup.mjs"},

  {regexp: /^\/sub\/([a-zA-Z0-9_-]+)/,     page: "../pages/sub/sub.mjs"},
])