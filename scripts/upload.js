const ci = require('miniprogram-ci');
const path = require('path');
const config = require('./upload.config.json');

async function upload() {
    const configDir = __dirname;
    const project = new ci.Project({
        appid: config.appid,
        type: 'miniGame',
        projectPath: path.resolve(configDir, '..', config.projectPath),
        privateKeyPath: path.resolve(configDir, config.privateKeyPath),
        ignores: config.ignores || []
    });

    const uploadResult = await ci.upload({
        project,
        version: config.version,
        desc: config.desc,
        setting: config.setting || {
            es6: true,
            es7: true,
            minify: true,
            codeProtect: false,
            autoPrefixWXSS: true
        },
        onProgressUpdate: (data) => {
            console.log('上传进度:', data);
        }
    });

    console.log('上传成功:', uploadResult);
}

upload().catch(console.error);
