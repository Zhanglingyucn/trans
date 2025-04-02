const fs = require('fs');
const readline = require('readline');
const path = require('path');

// 从命令行读取输入文件路径
const inputFilePath = process.argv[2];  // 从命令行参数获取文件路径

let outdir =  process.argv[3]

if (!inputFilePath) {
  console.error('请输入一个文件路径作为命令行参数,和一个路径作为输出目录');
  process.exit(1);
}

// 生成输出文件路径（去掉扩展名，添加 .lp）
const inputFileName = path.basename(inputFilePath, path.extname(inputFilePath));
const outputFilePath = `${outdir}/${inputFileName}.lp`;

// 生成 measurement 名称
const measurement = inputFileName;

// 创建写入输出文件的流
const outputStream = fs.createWriteStream(outputFilePath, { flags: 'w' });

// 创建读取输入文件的流
const rl = readline.createInterface({
  input: fs.createReadStream(inputFilePath),
  output: process.stdout,
  terminal: false
});

let isHeader = true; // 用来跳过表头
let headers = [];  // 用来保存表头字段

rl.on('line', (line) => {
  if (isHeader) {
    // 读取表头并保存
    headers = line.split(',');
    isHeader = false;
    return;
  }

  // 拆分每一行数据
  const fields = line.split(',');

  // 获取时间戳（假设时间戳始终是第一列）
  const timestamp = parseInt(fields[0]);  

  // 构建字段部分
  let fieldString = '';
  for (let i = 1; i < fields.length; i++) {
    const fieldName = `v${i}`;  // 生成字段名 v1, v2, v3, ...
    fieldString += `${fieldName}=${fields[i]}`;
    if (i < fields.length - 1) {
      fieldString += ',';  // 字段之间用逗号分隔
    }
  }

  // 转换为 Line Protocol 格式
  const lineProtocol = `${measurement} t=${timestamp},${fieldString} ${timestamp}\n`;

  // 将转换后的数据写入到输出文件
  outputStream.write(lineProtocol);
});

rl.on('close', () => {
  console.log('文件转换完成');
  outputStream.end();  // 结束输出流
});
