const EventEmitter = require("events");

module.exports = class WebSocketClient extends EventEmitter{
    cleanURL(url) {
        return url.split("://").length == 1 ? url : url.split("://")[1];
    }
    _bufferToBinary(data) {
        return Array.from(Buffer.from(data)).map(el => el.toString(2).padStart(8, "0")).join("");
    }
    _binaryToBuffer(binary) {
        let chunks = [];
        let _binary = binary.split("");
        while(_binary.length){
            chunks.push(parseInt(_binary.splice(0, 8).join(""), 2));
        }
        return Buffer.from(chunks);
    }
    constructor(url, verbose = false) {
        super();
        if(!url)throw new Error("URL not specified.");
        let tls = url.startsWith("wss://") ? true : false;
        url = this.cleanURL(url);
        let port = url.split(":").length == 1 ? 80 : parseInt(url.split(":")[1].split("/")[0]);
        let host = url.split(":").length == 1 ? url.split("/")[0] : url.split(":")[0];
        let path = "/" + url.split("/").slice(1).join("/");
        if(verbose)console.log("[~] Connecting to " + (tls ? "wss://" : "ws://") + host + ":" + port + path);
        this._connect = tls ? require("tls").connect : require("net").connect;
        this.socket = this._connect(port, host, () => {
            this.emit("open");
            this.socket.write(  "GET " + path + " HTTP/1.1\r\n" +
                                "Host: " + host + "\r\n" +
                                "Upgrade: websocket\r\n" + 
                                "Connection: Upgrade\r\n" +
                                "Sec-WebSocket-Key: " + require("crypto").randomBytes(16).toString("base64") + "\r\n" +
                                "Sec-WebSocket-Version: 13\r\n" +
                                "\r\n"  );
        });
        this.tempStorage = Buffer.from([]);
        this.socket.on("data", (data) => {
            let binary = this._bufferToBinary(data);
            if(binary.startsWith("10001001")){ // Ping.
                if(verbose)console.log("[~] <= Ping.");
                let response = binary.split("");
                response[6] = "1";
                response[7] = "0";
                response = response.join("");
                return this.socket.write(this._binaryToBuffer(response));
            }
            if(binary.startsWith("0100100001010100010101000101000000101111001100010010111000110001")){ // HTTP/1.1
                if(verbose)console.log("[~] Upgrade.");
                this.emit("upgrade");
                return;
            }
            if(binary.startsWith("0")){
              this.tempStorage = Buffer.from(Array.from(this.tempStorage).concat(Array.from(this.decode(binary))));
            }else{
              this.tempStorage = Buffer.from(Array.from(this.tempStorage).concat(Array.from(this.decode(binary))));
              this.emit("data", this.tempStorage);
              this.tempStorage = Buffer.from([]);
            }
        });
    }
    send(data){
        let binary_packet = "100000011";
        //0x48 0x65 0x6c 0x6c 0x6f => Hello
        //1000 0001 0 0000101 [01001000 01100101 01101100 01101100 01101111]
        if(data.length <= 125){
            binary_packet += (data.length.toString(2).padStart(7, "0"));
        }else if(data.length <= 65535){
            binary_packet += "1111110" + (data.length.toString(2).padStart(16, "0"));
        }else{
            throw new Error("Packets with length >= 65535 are currently unsupported.");
        }
        let mask = require("crypto").randomBytes(4);
        let data_enc = Array.from({length: data.length}).map((_, i) => data.charCodeAt(i));
        for(let i = 0; i < data_enc.length; i++){
            data_enc[i] = data_enc[i] ^ mask[i % 4];
        }
        data_enc = data_enc.map(el => el.toString(2).padStart(8, "0")).join("");
        binary_packet += this._bufferToBinary(mask) + data_enc;
        this.socket.write(this._binaryToBuffer(binary_packet));
    }
    decode(binary){
        let length = parseInt(binary.slice(9, 16), 2);
        if(length <= 125){}
        else if(length == 126){
            length = parseInt(binary.slice(16, 32), 2);
        }else{
            throw new Error("Packets with length >= 65535 are currently unsupported.");
        }
        let body_binary = (length <= 125 ? binary.slice(16) : binary.slice(32));
        return this._binaryToBuffer(body_binary);
    }
}