const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('YCDesk 自签名证书生成工具');
console.log('使用纯 Node.js 生成，无需 OpenSSL');
console.log('========================================');
console.log('');

// 生成自签名证书
function generateSelfSignedCert() {
  console.log('[1/4] 生成 RSA 密钥对...');
  
  // 生成 2048 位 RSA 密钥对
  const keys = forge.pki.rsa.generateKeyPair(2048);
  console.log('[完成] 密钥对已生成');
  console.log('');

  console.log('[2/4] 创建证书...');
  
  // 创建证书
  const cert = forge.pki.createCertificate();
  
  // 设置公钥
  cert.publicKey = keys.publicKey;
  
  // 设置序列号
  cert.serialNumber = '01';
  
  // 设置有效期（1 年）
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  
  // 设置主题信息
  const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'organizationName', value: 'YCDesk' },
    { name: 'organizationalUnitName', value: 'Development' },
    { name: 'countryName', value: 'CN' }
  ];
  
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // 自签名，发布者 = 主题
  
  // 设置扩展
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' }
      ]
    }
  ]);
  
  console.log('[完成] 证书已创建');
  console.log('');

  console.log('[3/4] 自签名证书...');
  
  // 用私钥自签名
  cert.sign(keys.privateKey, forge.md.sha256.create());
  console.log('[完成] 证书已签名');
  console.log('');

  console.log('[4/4] 保存文件...');
  
  // 保存私钥
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  fs.writeFileSync('server.key', privateKeyPem);
  console.log('[完成] server.key 已保存');
  
  // 保存证书
  const certPem = forge.pki.certificateToPem(cert);
  fs.writeFileSync('server.crt', certPem);
  console.log('[完成] server.crt 已保存');
  
  console.log('');
  console.log('========================================');
  console.log('证书生成成功！');
  console.log('========================================');
  console.log('');
  console.log('生成的文件：');
  console.log('  - server.crt  (证书文件)');
  console.log('  - server.key  (私钥文件)');
  console.log('');
  console.log('使用方法：');
  console.log('  node server.js --cert server.crt --key server.key --port 3000');
  console.log('');
  console.log('Android 端配置：');
  console.log('  将 server.crt 复制到:');
  console.log('  android/android/app/src/main/res/raw/ycdesk_self_signed.crt');
  console.log('  然后重新编译 APK');
  console.log('');
  console.log('Windows/Linux 端配置：');
  console.log('  双击 server.crt 安装到"受信任的根证书颁发机构"');
  console.log('');
  console.log('注意：');
  console.log('  - 此证书仅用于开发/测试环境');
  console.log('  - 生产环境请使用正规 CA 签发的证书（如 Let\'s Encrypt）');
  console.log('  - 浏览器会提示"不安全"，这是正常的');
  console.log('');
}

// 检查是否已有证书文件
function checkExistingFiles() {
  const hasCrt = fs.existsSync('server.crt');
  const hasKey = fs.existsSync('server.key');
  
  if (hasCrt || hasKey) {
    console.log('⚠️  警告：检测到已有证书文件：');
    if (hasCrt) console.log('   - server.crt');
    if (hasKey) console.log('   - server.key');
    console.log('');
    console.log('继续将会覆盖这些文件！');
    console.log('');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('是否继续？(y/N): ', (answer) => {
        rl.close();
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }
  
  return Promise.resolve(true);
}

// 主函数
async function main() {
  try {
    const shouldContinue = await checkExistingFiles();
    if (!shouldContinue) {
      console.log('操作已取消。');
      process.exit(0);
    }
    
    generateSelfSignedCert();
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('错误：生成证书失败！');
    console.error('========================================');
    console.error('');
    console.error('错误信息：', error.message);
    console.error('');
    console.error('请选择以下方案之一：');
    console.error('');
    console.error('方案 A：检查 node-forge 是否已安装');
    console.error('  cd server');
    console.error('  npm install --save node-forge');
    console.error('');
    console.error('方案 B：使用在线证书生成工具');
    console.error('  访问: https://www.selfsignedcertificate.com/');
    console.error('  或: https://mkcert.dev/');
    console.error('');
    process.exit(1);
  }
}

main();
