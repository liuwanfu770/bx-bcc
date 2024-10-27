const { exec } = require("child_process");

// 发送消息函数
function sendMessage(account, recipient, message) {
  exec(
    `signal-cli --config ${account} send ${recipient} "${message}"`,
    (err, stdout, stderr) => {
      if (err) {
        console.error(`Error: ${stderr}`);
      } else {
        console.log(`Message Sent: ${stdout}`);
      }
    }
  );
}

// 示例：发送一条消息
sendMessage("/path/to/account1", "+1234567890", "Hello");
