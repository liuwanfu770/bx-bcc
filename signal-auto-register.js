require('dotenv').config(); // 加载环境变量
const axios = require('axios');
const { promisify } = require('util');
const { exec: execCb } = require('child_process');
const exec = promisify(execCb);

// 通过环境变量加载 API Key
const CAPTCHA_API_KEY = process.env.CAPTCHA_API_KEY;
const SMS_ACTIVATE_API_KEY = process.env.SMS_ACTIVATE_API_KEY;

// 国家代码依次为：美国、香港、台湾、马来西亚、新加坡
const countries = [187, 73, 82, 83, 65];  // 美国，香港，台湾，马来，新加坡

// Step 1: 按国家顺序依次尝试获取虚拟号码
async function getVirtualNumber() {
    for (let country of countries) {
        const url = `https://sms-activate.org/stubs/handler_api.php?api_key=${SMS_ACTIVATE_API_KEY}&action=getNumber&service=sig&country=${country}&operator=any`;
        console.log(`正在尝试获取虚拟号码（国家代码: ${country}）...`);
        try {
            const response = await axios.get(url);
            console.log(`API 请求: ${url}`);
            console.log(`API 响应: ${response.data}`);
            if (response.data.includes('ACCESS_NUMBER')) {
                const parts = response.data.split(':');
                const activationId = parts[1];
                const phoneNumber = parts[2];
                console.log(`成功获取虚拟号码 (国家代码: ${country}): ${phoneNumber}`);
                return { activationId, phoneNumber };
            } else {
                console.log(`国家代码 ${country} 没有可用号码，继续尝试下一个国家...`);
            }
        } catch (error) {
            console.error(`请求错误（国家代码 ${country}）: `, error.response ? error.response.data : error.message);
        }
    }
    console.log('所有国家都没有可用号码');
    return null;
}

// Step 2: 使用 Signal-CLI 获取 CAPTCHA 链接并进行注册
async function getCaptchaLinkAndRegister(phoneNumber) {
    try {
        console.log(`正在尝试通过 Signal-CLI 注册号码: ${phoneNumber}`);
        const { stdout } = await exec(`signal-cli -a ${phoneNumber} register --captcha`);
        console.log(`Signal-CLI 输出: ${stdout}`);
        const captchaLink = stdout.match(/https:\/\/signalcaptcha\.org\/.*$/);
        if (captchaLink) {
            console.log(`成功捕获 CAPTCHA 链接: ${captchaLink[0]}`);
            return captchaLink[0];
        } else {
            throw new Error('未能捕获 CAPTCHA 链接');
        }
    } catch (error) {
        console.error(`Signal-CLI 注册失败: ${error}`);
        throw error;
    }
}

// Step 3: 创建 2Captcha 验证任务
async function createCaptchaTask(captchaUrl) {
    const url = 'https://2captcha.com/in.php';
    const data = {
        key: CAPTCHA_API_KEY,
        method: 'hcaptcha',
        sitekey: 'YOUR_SITEKEY', // 你需要替换为 CAPTCHA 页面中的 sitekey
        pageurl: captchaUrl,
        json: 1
    };
    console.log(`创建 Captcha 验证任务: ${JSON.stringify(data)}`);
    try {
        const response = await axios.post(url, null, { params: data });
        console.log(`2Captcha 请求: ${url}，数据: ${JSON.stringify(data)}`);
        console.log(`2Captcha 响应: ${JSON.stringify(response.data)}`);
        if (response.data.status === 1) {
            console.log(`Captcha Task ID: ${response.data.request}`);
            return response.data.request;
        } else {
            console.error('Captcha 任务创建失败: ', response.data);
            throw new Error('Captcha 任务创建失败');
        }
    } catch (error) {
        console.error('请求错误: ', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Step 4: 获取 Captcha 解决结果
async function getCaptchaResult(taskId) {
    const url = `https://2captcha.com/res.php?key=${CAPTCHA_API_KEY}&action=get&id=${taskId}&json=1`;
    let status = 'CAPCHA_NOT_READY';
    let attempts = 0;
    const maxAttempts = 12;  // 最多尝试 12 次（即 1 分钟）

    console.log(`开始获取 Captcha 结果，任务 ID: ${taskId}`);
    while (status === 'CAPCHA_NOT_READY' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 每次等待 5 秒
        attempts++;
        console.log(`第 ${attempts} 次尝试获取 Captcha 结果...`);
        try {
            const response = await axios.get(url);
            console.log(`Captcha 结果请求: ${url}`);
            console.log(`Captcha 结果响应: ${JSON.stringify(response.data)}`);
            if (response.data.status === 1) {
                console.log('Captcha 解决成功: ', response.data.request);
                return response.data.request;
            } else {
                console.log('Captcha 尚未解决, 等待中...');
            }
        } catch (error) {
            console.error('请求错误: ', error.response ? error.response.data : error.message);
        }
    }

    if (attempts >= maxAttempts) {
        throw new Error('Captcha 解决超时');
    }
}

// Step 5: 验证 Signal-CLI 账号
async function verifySignal(phoneNumber, smsCode) {
    try {
        console.log(`验证 Signal 账号，电话号码: ${phoneNumber}, SMS Code: ${smsCode}`);
        const { stdout } = await exec(`signal-cli -a ${phoneNumber} verify ${smsCode}`);
        console.log(`验证成功: ${stdout}`);
    } catch (error) {
        console.error(`验证失败: ${error}`);
        throw error;
    }
}

// 主流程
(async function () {
    const virtualNumber = await getVirtualNumber();
    if (virtualNumber) {
        const { activationId, phoneNumber } = virtualNumber;
        try {
            const captchaUrl = await getCaptchaLinkAndRegister(phoneNumber);
            const captchaTaskId = await createCaptchaTask(captchaUrl);
            const captchaSolution = await getCaptchaResult(captchaTaskId);
            await verifySignal(phoneNumber, captchaSolution);
        } catch (error) {
            console.error('注册流程失败:', error);
        }
    } else {
        console.log('没有找到可用号码，流程终止');
    }
})();
