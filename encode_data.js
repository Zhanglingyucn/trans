
/*
命令行输入参数：
tableName

根据tableName，
1、从tv_tableName读取t-v时间序列数据
2、创建OM3_tableName表，并写入OM3数据
3、创建flagName文件，并写入flag数据

*/


const fs = require("fs");
const { Pool } = require('pg');

const dbConfig = JSON.parse(fs.readFileSync("../initdb/dbconfig.json").toString());
console.log(dbConfig)
if (!dbConfig['username'] || !dbConfig['hostname'] || !dbConfig['password'] || !dbConfig['db']) {
    throw new Error("db config error");
}

const tableName = process.argv[2];  // 只需要传入表名
const tv_tableName = tableName
const OM3_tableName = tableName+'_om3'
const flagName = OM3_tableName + '.flagz'

console.log(tv_tableName,OM3_tableName,flagName)

const pool = new Pool({
    user: dbConfig['username'],
    host: dbConfig["hostname"],
    database: dbConfig['db'],
    password: dbConfig['password'],
});




// 删除表格数据的函数
async function dropAndCreateTable() {
    const dropTableSQL = `DROP TABLE IF EXISTS ${OM3_tableName};`;
    const createTableSQL = `
        CREATE TABLE ${OM3_tableName} (
            i INTEGER ,
            minvd NUMERIC,
            maxvd NUMERIC,
            PRIMARY KEY (i)
        );
    `;

    try {
        await pool.query(dropTableSQL);
        console.log(`Table ${OM3_tableName} dropped.`);
        await pool.query(createTableSQL);
        console.log(`Table ${OM3_tableName} created.`);
    } catch (err) {
        console.error(`Error dropping or creating table: ${err.message}`);
        throw err;
    }
}

// 删除 .flagz 文件
function deleteFlagFile() {
    const flagFilePath = `../flags/${flagName}`;
    try {
        if (fs.existsSync(flagFilePath)) {
            fs.unlinkSync(flagFilePath);
            console.log(`Flag file ${flagFilePath} deleted.`);
        } else {
            console.log(`Flag file ${flagFilePath} does not exist.`);
        }
    } catch (err) {
        console.error(`Error deleting flag file: ${err.message}`);
    }
}

async function computeTableFlag(data) {
    const maxT = data.rows[data.rows.length - 1]['t'];

    const bufLen = 2 ** Math.ceil(Math.log2(maxT));
    const tempArray = new Array(bufLen);
    data.rows.forEach(item => {
        tempArray[item['t']] = item['v'];
    });
    const arrayBuffer = new Buffer.alloc(bufLen);
    
    //console.log('tempArray',tempArray)

    for (let j = 0; j < tempArray.length; j += 2) {
        if (tempArray[j] === undefined && tempArray[j + 1] === undefined) {
            //都空
            continue;
        } else if (tempArray[j] === undefined) {
            //左空，右不空
            arrayBuffer[j] = 0;
            arrayBuffer[j + 1] = 1;
            continue;
        } else if (tempArray[j + 1] === undefined) {
            //左不空，右空
            arrayBuffer[j] = 1;
            arrayBuffer[j + 1] = 0;
            continue
        }

        if (tempArray[j] > tempArray[j + 1]) {
            arrayBuffer[j] = 0;
            arrayBuffer[j + 1] = 0;
        } else {
            arrayBuffer[j] = 1;
            arrayBuffer[j + 1] = 1;
        }
    }

    // console.log(arrayBuffer)
    // for(let i=0;i<arrayBuffer.length;i++){
    //     console.log(arrayBuffer[i])
    // }

    fs.writeFileSync(`../flags/${flagName}`, arrayBuffer);
    console.log("compute ordering flag finished")
    //pool.end()
}

// 自动创建表的函数
async function createTableIfNotExists() {
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${OM3_tableName} (
            i INTEGER,
            minvd NUMERIC,
            maxvd NUMERIC,
            PRIMARY KEY (i)
        );
    `;

    try {
        await pool.query(createTableSQL);
        console.log(`Table ${OM3_tableName} created or already exists.`);
    } catch (err) {
        console.error(`Error creating table: ${err.message}`);
        throw err;
    }
}

async function nonuniformMinMaxEncode() {
    await dropAndCreateTable();  // 清空表格中的旧数据
    deleteFlagFile();  // 删除相应的 .flagz 文件
    await createTableIfNotExists();  // 在查询前，检查并创建表

    const querySQL = `SELECT t,v FROM ${tv_tableName} ORDER by t ASC`;
    const queryData = await pool.query(querySQL);
    computeTableFlag(queryData);
    console.log(querySQL)
    // return
    let data = queryData.rows;

    let min = data[0]['v'];
    let max = data[0]['v'];
    let maxTime = data[0]['t'];
    for (let i = 0; i < data.length; i++) {
        if (data[i]['v'] < min) {
            min = data[i]['v'];
        }
        if (data[i]['v'] > max) {
            max = data[i]['v'];
        }
        if (data[i]['t'] > maxTime) {
            maxTime = data[i]['t'];
        }
    }
    const realLen = 2 ** Math.ceil(Math.log2(maxTime));
    const maxL = Math.ceil(Math.log2(maxTime));
    const dataArray = new Array(realLen)
    data.forEach((v, i) => {
        dataArray[v['t']] = v['v'];
    });
    let curL = 1;
    let minV = dataArray
    let maxV = dataArray
    for (let l = curL; l <= maxL; l++) {

        console.log("compute level:", l)

        let curMinVDiff = new Array(2 ** (maxL - l));
        let curMaxVDiff = new Array(2 ** (maxL - l));

        let curMinV = new Array(2 ** (maxL - l));
        let curMaxV = new Array(2 ** (maxL - l));


        for (let i = 0; i < 2 ** (maxL - l + 1); i += 2) {

            //Min
            if (minV[i] === undefined && minV[i + 1] !== undefined) {
                curV = minV[i + 1]
                curDif = undefined;
            } else if (minV[i] !== undefined && minV[i + 1] === undefined) {
                curV = minV[i];
                curDif = 0;
            } else if (minV[i] === undefined && minV[i + 1] === undefined) {
                curV = undefined;
                curDif = undefined;
            } else {
                curV = Math.min(minV[i], minV[i + 1]);
                curDif = minV[i] - minV[i + 1];
            }
            curMinV[i / 2] = curV;
            curMinVDiff[i / 2] = curDif;

            //Max
            if (maxV[i] === undefined && maxV[i + 1] !== undefined) {
                curV = maxV[i + 1];
                curDif = 0;
            } else if (maxV[i] !== undefined && maxV[i + 1] === undefined) {
                curV = maxV[i];
                curDif = undefined;
            } else if (maxV[i] === undefined && maxV[i + 1] === undefined) {
                curV = undefined;
                curDif = undefined;
            } else {
                curV = Math.max(maxV[i], maxV[i + 1]);
                curDif = maxV[i] - maxV[i + 1];
            }
            curMaxV[i / 2] = curV;
            curMaxVDiff[i / 2] = curDif;
        }
        minV = curMinV;
        maxV = curMaxV;

        if (l === 1) {
            continue
            // console.log(curMinT, curMinV, curMaxV, curMaxT);
        }

        let sqlStr = `insert into ${OM3_tableName}(i,minvd,maxvd) values `
        let i = 0;
        while (i < curMaxVDiff.length) {
            const usedL = maxL - l
            let tempStr = ''
            if (i + 10000 < curMaxVDiff.length) {
                for (let j = i; j < i + 10000; j++) {
                    if (curMinVDiff[j] === undefined && curMaxVDiff[j] === undefined) {
                        continue;
                    }

                    if (tempStr === '') {
                        tempStr += ` (${(2 ** usedL) + j},${curMinVDiff[j] === undefined ? "NULL" : curMinVDiff[j]},${curMaxVDiff[j] === undefined ? "NULL" : curMaxVDiff[j]})`;
                    } else {
                        tempStr += `,(${(2 ** usedL) + j},${curMinVDiff[j] === undefined ? "NULL" : curMinVDiff[j]},${curMaxVDiff[j] === undefined ? "NULL" : curMaxVDiff[j]})`;
                    }
                }

            } else {
                for (let j = i; j < curMaxVDiff.length; j++) {
                    if (curMinVDiff[j] === undefined && curMaxVDiff[j] === undefined) {
                        continue;
                    }

                    if (tempStr === '') {
                        tempStr += ` (${(2 ** usedL) + j},${curMinVDiff[j] === undefined ? "NULL" : curMinVDiff[j]},${curMaxVDiff[j] === undefined ? "NULL" : curMaxVDiff[j]})`;
                    } else {
                        tempStr += `,(${(2 ** usedL) + j},${curMinVDiff[j] === undefined ? "NULL" : curMinVDiff[j]},${curMaxVDiff[j] === undefined ? "NULL" : curMaxVDiff[j]})`;
                    }
                }
            }
            i += 10000
            if (tempStr === '') {
                continue
            }
            let sql = sqlStr + tempStr;
            console.log('sql',sql)
            try {
                await pool.query(sql)
            } catch (err) {
                console.log(sql)
                pool.end();
                throw err
            }
        }
    }
    if (min !== undefined && max !== undefined) {
        const l0Sql = `insert into ${OM3_tableName} values(${-1},${min},${max})`
        await pool.query(l0Sql);
        pool.end()
    }

}
nonuniformMinMaxEncode()


