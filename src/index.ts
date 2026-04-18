import { serve } from "bun";
import events from "../api/events";
import nearest from "../api/nearest-restaurant";
import index from "./index.html";

const server = serve({
  routes: {
    "/*": index,
    "/api/events": req => events(req),
    "/api/nearest-restaurant": req => nearest(req),
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
