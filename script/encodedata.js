// node --max-old-space-size=202400 encodedata.js nycdata
// node --max-old-space-size=202400 encodedata.js inteldata
// node --max-old-space-size=202400 encodedata.js sensordata
// node --max-old-space-size=202400 encodedata.js soccerdata
// node --max-old-space-size=202400 encodedata.js stockdata
// node --max-old-space-size=202400 encodedata.js traffic
// node --max-old-space-size=202400 encodedata.js synthetic_1m
// node --max-old-space-size=202400 encodedata.js synthetic_2m
// node --max-old-space-size=202400 encodedata.js synthetic_4m
// node --max-old-space-size=202400 encodedata.js synthetic_8m
// node --max-old-space-size=202400 encodedata.js synthetic_16m
// node --max-old-space-size=202400 encodedata.js synthetic_32m
// node --max-old-space-size=202400 encodedata.js synthetic_64m
// node --max-old-space-size=202400 encodedata.js synthetic_128m
// node --max-old-space-size=202400 encodedata.js synthetic_256m

const fs = require("fs");
//const { Pool } = require('pg');
const { Pool, types } = require('pg');
// 将NUMERIC类型的数据自动转换为浮点数
types.setTypeParser(1700, (val) => parseFloat(val));

const dbConfig = JSON.parse(fs.readFileSync("../initdb/dbconfig.json").toString());
console.log(dbConfig)
if (!dbConfig['username'] || !dbConfig['hostname'] || !dbConfig['password'] || !dbConfig['db']) {
    throw new Error("db config error");
}

const CHUNK_SIZE = 100000000; // 每块1亿条记录

const tableName = process.argv[2];  // 只需要传入表名
const tv_tableName = tableName
const OM3_tableName = tableName + '_om3'
const flagName = OM3_tableName + '.flagz'

console.log(tv_tableName, OM3_tableName, flagName)

const pool = new Pool({
    user: dbConfig['username'],
    host: dbConfig["hostname"],
    database: dbConfig['db'],
    password: dbConfig['password'],
});

// Function to get all 'v' columns from the input table
async function getVColumns() {
    const query = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name LIKE 'v%';
    `;
    try {
        const res = await pool.query(query, [tv_tableName]);
        return res.rows.map(row => row.column_name);
    } catch (err) {
        console.error(`Error fetching columns: ${err.message}`);
        throw err;
    }
}

// 删除表格数据的函数
async function dropAndCreateTable(vColumns) {
    const dropTableSQL = `DROP TABLE IF EXISTS ${OM3_tableName};`;

    // Dynamically create columns for each v column
    const createColumns = vColumns.map(v => `
        minvd_${v} NUMERIC,
        maxvd_${v} NUMERIC,
        avevd_${v} NUMERIC
    `).join(',');

    const createTableSQL = `
        CREATE TABLE ${OM3_tableName} (
            i INTEGER PRIMARY KEY,
            ${createColumns}
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
function deleteFlagFile(vColumns) {
    vColumns.forEach(v => {
        const flagFilePath = `../flags/${OM3_tableName}_${v}` + '.flagz';
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
    })
}

// Compute flags - assuming flags are per table, not per v column
async function computeTableFlag(bigData, columnName) {
    let maxT = 0;

    // 第一步：确定 maxT
    bigData.forEach((item) => {
        if (item.t > maxT) {
            maxT = item.t;
        }
    });
    maxT++;

    const bufLen = 2 ** Math.ceil(Math.log2(maxT || 1));
    const arrayBuffer = Buffer.alloc(bufLen); // 使用 Buffer 代替临时数组
    let tempArray = new BigArray(CHUNK_SIZE)

    bigData.forEach((item) => {
        tempArray.set(item.t, item[columnName] !== undefined ? item[columnName] : undefined);
    });

    for (let j = 0; j < bufLen; j += 2) {
        const val1 = tempArray.get(j);
        const val2 = tempArray.get(j + 1);

        if (val1 === undefined && val2 === undefined) {
            // Both undefined
            continue;
        } else if (val1 === undefined) {
            // Left undefined, right not
            arrayBuffer[j] = 0;
            arrayBuffer[j + 1] = 1;
            continue;
        } else if (val2 === undefined) {
            // Left not undefined, right undefined
            arrayBuffer[j] = 1;
            arrayBuffer[j + 1] = 0;
            continue;
        }

        if (val1 > val2) {
            arrayBuffer[j] = 0;
            arrayBuffer[j + 1] = 0;
        } else {
            arrayBuffer[j] = 1;
            arrayBuffer[j + 1] = 1;
        }
    }

    fs.writeFileSync(`../flags/${OM3_tableName}_${columnName}.flagz`, arrayBuffer);
   //console.log("Compute ordering flag finished");
}


// 自动创建表的函数
async function createTableIfNotExists(vColumns) {
    // Dynamically create columns for each v column
    const createColumns = vColumns.map(v => `
        minvd_${v} NUMERIC,
        maxvd_${v} NUMERIC,
        avevd_${v} NUMERIC
    `).join(',');

    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${OM3_tableName} (
            i INTEGER PRIMARY KEY,
            ${createColumns}
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

// 创建 tablenum 表
async function createTablenumTable() {
    const createTablenumSQL = `
        CREATE TABLE IF NOT EXISTS tablenum (
            dataName TEXT PRIMARY KEY,
            dataNum INTEGER
        );
    `;
    try {
        await pool.query(createTablenumSQL);
        console.log(`Table tablenum created or already exists.`);
    } catch (err) {
        console.error(`Error creating table tablenum: ${err.message}`);
        throw err;
    }
}

// 更新或插入编码次数到 tablenum 表
async function updateTablenumEntry(dataName) {
    // 获取表的长度（记录数）
    const queryLengthSQL = `SELECT COUNT(*) FROM ${dataName};`;
    try {
        // 执行查询以获取表的长度
        const result = await pool.query(queryLengthSQL);
        const dataNum = parseInt(result.rows[0].count, 10); // Ensure integer

        // 插入或更新 tablenum 表，存入表名和长度
        const upsertSQL = `
            INSERT INTO tablenum (dataName, dataNum)
            VALUES ($1, $2)
            ON CONFLICT (dataName) DO UPDATE SET dataNum = EXCLUDED.dataNum;
        `;
        let om3_name = dataName + '_om3'
        await pool.query(upsertSQL, [OM3_tableName, dataNum]);
        console.log(`Updated table length for: ${dataName}, length: ${dataNum}`);
        return dataNum;
    } catch (err) {
        console.error(`Error updating tablenum: ${err.message}`);
        throw err;
    }
}

let bigarraynum = 0
class BigArray {
    constructor(chunkSize = 100000000) { 
        this.chunkSize = chunkSize;
        this.chunks = [];
        bigarraynum++
    }

    push(item) {
        if (this.chunks.length === 0 || this.chunks[this.chunks.length - 1].length >= this.chunkSize) {
            this.chunks.push([]);
        }
        this.chunks[this.chunks.length - 1].push(item);
    }

    // 获取总长度
    get length() {
        if (this.chunks.length === 0) return 0;
        const lastChunk = this.chunks[this.chunks.length - 1];
        return (this.chunks.length - 1) * this.chunkSize + lastChunk.length;
    }

    // 设置特定索引的数据
    set(index, item) {
        const chunkIndex = Math.floor(index / this.chunkSize);
        const withinChunkIndex = index % this.chunkSize;
        if (!this.chunks[chunkIndex]) {
            this.chunks[chunkIndex] = [];
        }
        this.chunks[chunkIndex][withinChunkIndex] = item;
    }


    // 获取特定索引的数据
    get(index) {
        const chunkIndex = Math.floor(index / this.chunkSize);
        const withinChunkIndex = index % this.chunkSize;
        if (this.chunks[chunkIndex] && this.chunks[chunkIndex][withinChunkIndex] !== undefined) {
            return this.chunks[chunkIndex][withinChunkIndex];
        }
        return undefined;
    }


    // 遍历大数组
    forEach(callback) {
        for (let i = 0; i < this.chunks.length; i++) {
            for (let j = 0; j < this.chunks[i].length; j++) {
                callback(this.chunks[i][j], i * this.chunkSize + j);
            }
        }
    }

}


async function nonuniformMinMaxEncode() {
        // Step 1: 获取所有 'v' 列
        const vColumns = await getVColumns();
        //console.log(vColumns)
        if (vColumns.length === 0) {
            throw new Error("No 'v' columns found in the table.");
        }
        console.log(`Detected v columns: ${vColumns.join(', ')}`);

        // Step 1.1: 创建和更新相关表格
        await createTablenumTable();  // 创建 tablenum 表
        const tableLength = await updateTablenumEntry(tableName);  // 更新或插入编码计数，假设返回表长度

        await dropAndCreateTable(vColumns);  // 清空表格中的旧数据并创建 OM3 表
        deleteFlagFile(vColumns);  // 删除相应的 .flagz 文件
        await createTableIfNotExists(vColumns);  // 在查询前，检查并创建表

        // Step 2: 根据表长决定是否分块查询
        const totalRecords = tableLength; // 从 updateTablenumEntry 返回的表长
        const numChunks = Math.ceil(totalRecords / CHUNK_SIZE);
        console.log(`Total records: ${totalRecords}, Number of chunks: ${numChunks}`);

        const bigData = new BigArray(CHUNK_SIZE); // 创建 BigArray 实例，每块1亿条记录

        for (let chunk = 0; chunk < numChunks; chunk++) {
            const offset = chunk * CHUNK_SIZE;
            const limit = CHUNK_SIZE;
            console.log(`Fetching chunk ${chunk + 1}/${numChunks} with OFFSET ${offset} and LIMIT ${limit}`);
            const selectColumns = ['t', ...vColumns].join(', ');
            const querySQL = `SELECT ${selectColumns} FROM ${tv_tableName} ORDER BY t ASC LIMIT ${limit} OFFSET ${offset}`;
            const queryData = await pool.query(querySQL);
            const rows = queryData.rows;
            //console.log(rows)

            if (rows.length === 0) {
                console.log(`No more data found at chunk ${chunk + 1}`);
                break;
            }

            // 将每行数据添加到 BigArray 中
            rows.forEach(row => {
                //console.log(row)
                bigData.push(row);
            });


            //console.log(`Fetched and added ${rows.length} rows to BigArray. Current total: ${bigData.length}`);

        
        }


        // 调用 computeTableFlag 处理整个大数据集
        for (const columnName of vColumns) {
            //console.log(`Computing flags for column: ${columnName}`);
            await computeTableFlag(bigData, columnName);
        }

        //console.log(bigData)
        // 初始化 min 和 max
        const min = {};
        const max = {};
        const ave = {};
        console.log('wddwd',bigData.length)
        let maxTime = bigData.length > 0 ? bigData.get(bigData.length - 1)['t'] : 0;
        maxTime++;
        console.log('maxTime:',maxTime)

        // 初始化 min 和 max
        if (bigData.length > 0) {
            vColumns.forEach(v => {
                console.log(bigData.get(0)[v])
                min[v] = bigData.get(0)[v];
                max[v] = bigData.get(0)[v];
                ave[v] = 0;  // 初始化 ave[v]，用于累加求和
            });
        }

        // 遍历所有数据更新 min 和 max
        bigData.forEach((row, index) => {
            vColumns.forEach(v => {
                if (row[v] < min[v]) {
                    min[v] = row[v];
                }
                if (row[v] > max[v]) {
                    max[v] = row[v];
                }
                // 累加每个列的值以计算平均值
                ave[v] += row[v];  // 累加每列的值
            });

            //console.log('Global Ave:', ave);
        });
        

        console.log('Global Ave:', ave);
        console.log('bigData.length', bigData.length);
        // 计算每个列的平均值
        let length = 2 ** Math.ceil(Math.log2(bigData.length || 1))
        vColumns.forEach(v => {
            ave[v] /= length;  // 除以总的记录数，得到平均值
        });



        console.log('Global Min:', min);
        console.log('Global Max:', max);
        console.log('Global Ave:', ave);

        const realLen = 2 ** Math.ceil(Math.log2(maxTime || 1)); // 处理 maxTime = 0
        const maxL = Math.ceil(Math.log2(maxTime || 1));
        const dataArray = new BigArray(CHUNK_SIZE); // 使用 BigArray 代替普通数组
        console.log(dataArray)

        // 将 bigData 填充到 dataArray 中
        bigData.forEach((row) => {
            dataArray.set(row['t'], row);
        });

        // 初始化 minV 和 maxV，使用 BigArray 管理
        const minV = {};
        const maxV = {};
        const aveV = {};

        vColumns.forEach(v => {
            minV[v] = new BigArray(CHUNK_SIZE);
            for(let i=0;i<dataArray.length;i++){
                minV[v].push(dataArray.get(i)[v])
            }
            maxV[v] = minV[v]
            aveV[v] = minV[v]
        });

        for (let l = 1; l <= maxL; l++) {
            console.log("Compute level:", l);

            const curMinVDiff = {};
            const curMaxVDiff = {};
            const curAveVDiff = {};
            const curMinV = {};
            const curMaxV = {};
            const curAveV = {};

            vColumns.forEach(v => {
                curMinVDiff[v] = new BigArray(CHUNK_SIZE); 
                curMaxVDiff[v] = new BigArray(CHUNK_SIZE);
                curAveVDiff[v] = new BigArray(CHUNK_SIZE);
                curMinV[v] = new BigArray(CHUNK_SIZE);
                curMaxV[v] = new BigArray(CHUNK_SIZE);
                curAveV[v] = new BigArray(CHUNK_SIZE);

            });

            console.log('big array num：',bigarraynum)
            // setInterval(() => {
            //     console.log('内存使用情况',process.memoryUsage());
            // }, 5000);


            for (let i = 0; i < 2 ** (maxL - l + 1); i += 2) {


                vColumns.forEach(v => {
                    // 最小值计算
                    let curV_min, curDif_min;
                    let val1 = minV[v].get(i);
                    let val2 = minV[v].get(i + 1);

                    if (val1 === undefined && val2 !== undefined) {
                        curV_min = val2;
                        curDif_min = undefined;
                    } else if (val1 !== undefined && val2 === undefined) {
                        curV_min = val1;
                        curDif_min = 0;
                    } else if (val1 === undefined && val2 === undefined) {
                        curV_min = undefined;
                        curDif_min = undefined;
                    } else {
                        curV_min = Math.min(val1, val2);
                        curDif_min = val1 - val2;
                    }

                    curMinV[v].set(i/2, curV_min);
                    curMinVDiff[v].set(i/2,curDif_min);

                    let curV_max, curDif_max;
                    val1 = maxV[v].get(i);
                    val2 = maxV[v].get(i + 1);


                    if (val1 === undefined && val2 !== undefined) {
                        curV_max = val2;
                        curDif_max = 0;
                    } else if (val1 !== undefined && val2 === undefined) {
                        curV_max = val1;
                        curDif_max = undefined;
                    } else if (val1 === undefined && val2 === undefined) {
                        curV_max = undefined;
                        curDif_max = undefined;
                    } else {
                        curV_max = Math.max(val1, val2);
                        curDif_max = val1 - val2;
                    }


                    curMaxV[v].set(i/2, curV_max);
                    curMaxVDiff[v].set(i/2, curDif_max);


                    let curV_ave, curDif_ave;
                    val1 = aveV[v].get(i);
                    val2 = aveV[v].get(i + 1);

                    
                    if (val1 === undefined && val2 !== undefined) {
                        curV_ave = val2/2;
                        curDif_ave = -val2;
                    } else if (val1 !== undefined && val2 === undefined) {
                        curV_ave = val1/2;
                        curDif_ave = val1;
                    } else if (val1 === undefined && val2 === undefined) {
                        curV_ave = 0;
                        curDif_ave = 0;
                    } else {
                        curV_ave = (val1 + val2) / 2;
                        curDif_ave = val1 - val2;
                    }


                    curAveV[v].set(i/2, curV_ave);
                    curAveVDiff[v].set(i/2, curDif_ave);


                });
            }
		
console.log("更新 minV 和 maxV start")
            // 更新 minV 和 maxV
            vColumns.forEach(v => {
                minV[v] = curMinV[v];
                maxV[v] = curMaxV[v];
                aveV[v] = curAveV[v];
            });
            if (l === 1) {
                continue;
            }

            // 批量插入数据到数据库
            for (let batchIndex = 0; batchIndex < 2 ** (maxL - l); batchIndex += 10000) {
                let sqlStr = `INSERT INTO ${OM3_tableName} (i${vColumns.map(v => `, minvd_${v}, maxvd_${v}, avevd_${v}`).join('')}) VALUES `;
                let tempStr = '';
                let batchEnd = Math.min(batchIndex + 10000, 2 ** (maxL - l));

                for (let j = batchIndex; j < batchEnd; j++) {
                    let values = [`${(2 ** (maxL - l)) + j}`];
                    vColumns.forEach(v => {
                        const minVal = curMinVDiff[v].get(j) === undefined ? "NULL" : curMinVDiff[v].get(j);
                        const maxVal = curMaxVDiff[v].get(j) === undefined ? "NULL" : curMaxVDiff[v].get(j);
                        const aveVal = curAveVDiff[v].get(j) === undefined ? "NULL" : curAveVDiff[v].get(j);
                        values.push(minVal, maxVal, aveVal);
                    });

                    // 与avg原版不一致，原版是只要min和max为空，就continue
                    // 仅插入至少有一个列不为 NULL 的行
                    //const allNull = vColumns.every(v => curMinVDiff[v].get(j) === undefined && curMaxVDiff[v].get(j) === undefined && curAveVDiff[v].get(j) === undefined);

                    const allNull = vColumns.every(v => curMinVDiff[v].get(j) === undefined && curMaxVDiff[v].get(j) === undefined);
                    
                    if (allNull) {
                        continue;
                    }

                    if (tempStr === '') {
                        tempStr += `(${values.join(',')})`;
                    } else {
                        tempStr += `,(${values.join(',')})`;
                    }
                }

                if (tempStr === '') {
                    continue;
                }

                let sql = sqlStr + tempStr;
                try {
                    await pool.query(sql);
                } catch (err) {
                    console.error(`Insert failed at batch ${batchIndex / 10000 + 1}: ${err.message}`);
                    console.log(`Failed SQL: ${sql}`);
                    await pool.end();
                    throw err;
                }
            }
        }

        // 插入每个 'v' 列的全局最小值和最大值，i = -1
        let insertValues = [];
        vColumns.forEach(v => {
            if (min[v] !== undefined && max[v] !== undefined && ave[v] !== undefined) {
                insertValues.push(`${min[v]}, ${max[v]}, ${ave[v]}`);
            } else {
                insertValues.push("NULL, NULL, NULL");
            }
        });
        const l0Sql = `INSERT INTO ${OM3_tableName} (i${vColumns.map(v => `, minvd_${v}, maxvd_${v}, avevd_${v}`).join('')}) VALUES (-1${insertValues.map(val => `, ${val}`).join('')})`;
        try {
            await pool.query(l0Sql);
        } catch (err) {
            console.error(`Error inserting level 0 data: ${err.message}`);
            throw err;
        }

        await pool.end();
        console.log("nonuniformMinMaxEncode 完成。");
    }

nonuniformMinMaxEncode().catch(err => {
    console.error(`Process failed: ${err.message}`);
    pool.end();
});
