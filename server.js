const express = require("express");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const app = express();
const port = 3000;

// 解析 JSON 请求体
app.use(bodyParser.json());

// 发送消息的 API
app.post("/sendMessage", (req, res) => {
  const { account, recipient, message } = req.body;

  // Signal-cli 命令
  const command = `signal-cli --config ${account} send ${recipient} "${message}"`;

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error sending message: ${stderr}`);
      return res.status(500).json({ error: stderr });
    }
    res.json({ status: "Message Sent", data: stdout });
  });
});

// 接收消息的 API
app.get("/getMessages", (req, res) => {
  const { account } = req.query;

  // Signal-cli 接收消息
  const command = `signal-cli --config ${account} receive`;

  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error receiving messages: ${stderr}`);
      return res.status(500).json({ error: stderr });
    }
    res.json({ messages: stdout });
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`Signal-CLI backend API running on port ${port}`);
});
