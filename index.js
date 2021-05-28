const WebSocket = require("./ws.js");
const ws = new WebSocket("ws://echo.websocket.org/");
ws.on("open", () => {
    console.log("[+] Opened connection.");
});
ws.on("upgrade", () => {
    console.log("[+] Upgraded to WebSocket.");
    ws.send("Hello, World!");
});
ws.on("data", (data) => {
    console.log(data.toString());
});