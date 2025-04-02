const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const readline = require('readline');
const copyFrom = require('pg-copy-streams').from;

// PostgreSQL 配置
const dbConfig = JSON.parse(fs.readFileSync("../initdb/dbconfig.json").toString());

const client = new Client({
  user: dbConfig['username'],
  host: dbConfig["hostname"],
  database: dbConfig['db'],
  password: dbConfig['password'],
  port: 5432,
});



client.connect();

// 创建 readline 接口
// const rl = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout
// });

// // 询问用户输入 CSV 文件路径
// rl.question('请输入CSV文件路径: ', (filePath) => {
//   // 关闭 readline 接口
//   rl.close();

//   const tableName = path.basename(filePath, '.csv'); // 使用文件名作为表名

//   // 读取 CSV 文件并插入到数据库中
//   processCSVFile(filePath, tableName);
// });

  const args = process.argv.slice();

  let filePath=args[2]
  const tableName = path.basename(filePath, '.csv'); // 使用文件名作为表名

  // 读取 CSV 文件并插入到数据库中
  processCSVFile(filePath, tableName);





function processCSVFile(filePath, tableName) {
  
  const fileStream = fs.createReadStream(filePath);
  const firstRow = [];
  
  //console.log(fileStream)

  // 读取 CSV 文件的第一行，用于创建表
  fileStream.pipe(require('csv-parser')())
    .on('data', (row) => {
      if (firstRow.length === 0) {
        // 获取表头作为列名
        firstRow.push(...Object.keys(row));
      }
    })
    .on('end', () => {
      // 创建表的 SQL 语句，删除已存在的表并重新创建
      const createTableQuery = `
        DROP TABLE IF EXISTS "${tableName}";
        CREATE TABLE "${tableName}" (
          ${firstRow.map(col => `"${col}" numeric`).join(', ')}
        );
      `;

      console.log(createTableQuery)
      
      // 执行删除和创建表的 SQL 语句
      client.query(createTableQuery, (err, res) => {
        if (err) {
          console.error('创建表时发生错误:', err);
          return;
        }

        console.log(`表 ${tableName} 已创建`);

        // 使用 COPY 命令将数据插入到表中
        const copyQuery = `COPY "${tableName}" FROM STDIN WITH CSV HEADER DELIMITER ',';`;

        const copyStream = client.query(copyFrom(copyQuery));
        const dataStream = fs.createReadStream(filePath);

        dataStream.pipe(copyStream)
          .on('finish', () => {
            console.log(`数据已成功插入到 ${tableName}`);
            checkDataInsertion(tableName);
          })
          .on('error', (err) => {
            console.error('导入数据时发生错误:', err);
            client.end();
          });
      });
    })
    .on('error', (err) => {
      console.error('读取 CSV 文件时发生错误:', err);
    });
}

function checkDataInsertion(tableName) {
  // 检查表中是否有数据
  const checkQuery = `SELECT COUNT(*) FROM "${tableName}";`;
  client.query(checkQuery, (err, res) => {
    if (err) {
      console.error('查询数据时发生错误:', err);
    } else {
      console.log(`表 ${tableName} 中有 ${res.rows[0].count} 行数据`);
    }
    client.end();
  });
}
