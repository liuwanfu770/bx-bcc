require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY;
const SMS_ACTIVATE_API_KEY = process.env.SMS_ACTIVATE_API_KEY;
const SIGNAL_CLI_PATH = "signal-cli"; // signal-cli 命令路径
const SITE_KEY = "5fad97ac-7d06-4e44-b18a-b950b20148ff";
const SIGNAL_URL = "https://signalcaptchas.org/registration/generate";
const SERVICE_ID = "525228"; // 虚拟号码服务的ID
const COUNTRY = 5;
const PROVIDER = "selfsms";

// 获取 hCaptcha 验证
async function solveCaptcha() {
  console.log("1. 获取 hCaptcha 验证...");
  const response = await axios.post("https://api.2captcha.com/createTask", {
    clientKey: CAPTCHA_API_KEY,
    task: {
      type: "HCaptchaTaskProxyless",
      websiteURL: SIGNAL_URL,
      websiteKey: SITE_KEY,
    },
  });

  // 检查任务生成是否成功
  if (response.data.errorId) {
    throw new Error(`2Captcha 错误: ${response.data.errorDescription}`);
  }

  const taskId = response.data.taskId;

  // 检查验证码结果
  for (let i = 0; i < 30; i++) {
    // 增加轮询次数以增加容错
    console.log(`轮询第 ${i + 1} 次...等待 CAPTCHA 结果`);
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 增加等待时间到10秒
    const result = await axios.post("https://api.2captcha.com/getTaskResult", {
      clientKey: CAPTCHA_API_KEY,
      taskId: taskId,
    });

    if (result.data.status === "ready") {
      const captchaToken = `signalcaptcha://signal-hcaptcha.${SITE_KEY}.registration.${result.data.solution.token}`;
      console.log("获取到的完整 captchaToken:", captchaToken);
      return captchaToken;
    } else {
      console.log("CAPTCHA 结果未就绪，继续等待...");
    }
  }

  throw new Error("Captcha 验证超时");
}

// 获取虚拟号码
async function getVirtualNumber() {
  console.log("2. 获取虚拟号码...");
  const response = await axios.get(
    `https://lubansms.com/v2/api/getNumber?apikey=${SMS_ACTIVATE_API_KEY}&service_id=${SERVICE_ID}&country=${COUNTRY}&provider=${PROVIDER}`
  );
  if (response.data.code === 0) {
    console.log("成功获取虚拟号码:", response.data.number);
    return {
      phoneNumber: response.data.number,
      requestId: response.data.request_id,
    };
  }
  throw new Error("获取虚拟号码失败");
}

// 提交注册
async function registerSignal(phoneNumber, captchaToken) {
  console.log("3. 提交 Signal 注册请求...");
  const { execSync } = require("child_process");
  const command = `${SIGNAL_CLI_PATH} -a ${phoneNumber} register --captcha "${captchaToken}"`;
  try {
    execSync(command, { stdio: "inherit" });
  } catch (error) {
    if (error.toString().includes("StatusCode: 429")) {
      console.error("注册请求过于频繁，请稍后重试");
      await new Promise((resolve) => setTimeout(resolve, 3600000)); // 等待一小时后重试
      throw new Error("注册请求频率限制");
    }
    console.error("Signal 注册流程失败:", error.message);
    throw new Error("注册流程失败");
  }
}

// 获取短信验证码
async function getSmsCode(requestId) {
  console.log("4. 等待短信验证码...");
  for (let i = 0; i < 12; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 等待5秒
    const response = await axios.get(
      `https://lubansms.com/v2/api/getSms?apikey=${SMS_ACTIVATE_API_KEY}&request_id=${requestId}&json=1`
    );
    if (response.data.code === 0 && response.data.sms) {
      console.log("收到短信验证码:", response.data.sms);
      return response.data.sms;
    }
    console.log(`尚未收到短信验证码，重试次数：${i + 1}`);
  }
  throw new Error("接收短信验证码超时");
}

// 验证短信验证码并保存账号
async function verifyCode(phoneNumber, smsCode) {
  console.log("5. 提交验证码进行验证...");
  const { execSync } = require("child_process");
  const command = `${SIGNAL_CLI_PATH} -a ${phoneNumber} verify ${smsCode}`;
  try {
    execSync(command, { stdio: "inherit" });
    fs.appendFileSync(
      path.join(__dirname, "accounts.txt"),
      `${phoneNumber}\n`,
      "utf8"
    );
    console.log(`账号 ${phoneNumber} 已成功注册并存入文件`);
  } catch (error) {
    console.error("验证码验证失败:", error.message);
    throw new Error("验证码验证失败");
  }
}

// 主函数
(async function () {
  try {
    const captchaToken = await solveCaptcha();
    const { phoneNumber, requestId } = await getVirtualNumber();
    await registerSignal(phoneNumber, captchaToken);
    const smsCode = await getSmsCode(requestId);
    await verifyCode(phoneNumber, smsCode);
    console.log("注册流程完成！");
  } catch (error) {
    if (error.message.includes("频率限制")) {
      console.log("等待一段时间后重试注册...");
      await new Promise((resolve) => setTimeout(resolve, 3600000)); // 延迟一小时后重新尝试
      // 在此可以选择重新调用主函数，或仅在特定条件下重试
    } else {
      console.error("注册流程失败:", error.message);
    }
  }
})();
