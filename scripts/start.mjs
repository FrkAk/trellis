process.env.HOSTNAME = process.env.HOSTNAME ?? "127.0.0.1";
await import("../.next/standalone/server.js");
