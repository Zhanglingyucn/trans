// const { getMaxListeners } = require('events');
// const fs = require('fs');
// const { get } = require('http');
// const dbConfig = JSON.parse(fs.readFileSync("../initdb/dbconfig.json").toString());
// const { Pool } = require('pg');
// const path = require('path');

// const pool = new Pool({
//     user: dbConfig['username'],
//     host: dbConfig["hostname"],
//     database: dbConfig['db'],
//     password: dbConfig['password'],
// });

// import {Heap} from 'heap-js';
// import * as fs from 'fs' 
// import * as Pool from 'pg' 

const fs = require("fs");
const { Pool } = require('pg');
const { Heap }  = require('heap-js');
const { get } = require("http");

const dbConfig = JSON.parse(fs.readFileSync("../initdb/dbconfig.json").toString());


console.time('Pool'); // 开始计时
const pool = new Pool({
    user: dbConfig['username'],
    host: dbConfig["hostname"],
    database: dbConfig['db'],
    password: dbConfig['password'],
});
console.timeEnd('Pool'); // 结束计时并打印结果

let queryCounts = 0

let element = {
    value:0,
    index:0
};

class MaxHeap{
    constructor(){
        const elementMaxComparator = (a, b) => b.value - a.value;
        this.heap = new Heap(elementMaxComparator);
    }

    add(elements){
        this.heap.push(elements);
    }
    
    isEmpty(){
        return this.heap.length == 0;
    }
    
    pop(){
        return this.heap.pop();
    }
    
    getTop(){
        return this.heap.peek();
    }
}

class MinHeap{
    constructor(){
        const elementComparator = (a, b) => a.value - b.value;
        this.heap = new Heap(elementComparator);
    }

    add(elements){
        this.heap.push(elements);
    }
    
    isEmpty(){
        return this.heap.length == 0;
    }
    
    pop(){
        return this.heap.pop();
    }
    
    getTop(){
        return this.heap.peek();
    }

   
}

const MAXNODENUM = 1000 * 10000

// 定义 SegmentTreeNode 类
class SegmentTreeNode {
    constructor(sTime, eTime, level, index, i, min = 0, max = 0, id, minDiff = null, maxDiff = null, left = null, right = null, leftIndex = null, rightIndex = null) {
        this.sTime = sTime;       // 开始时间
        this.eTime = eTime;       // 结束时间
        this.level = level;       // 层级
        this.index = index;       // 当前节点的索引
        this.i = i;               // 当前节点在该层的第几个位置
        this.min = min;           // 当前节点的最小值
        this.max = max;           // 当前节点的最大值
        this.id = id;             // 当前节点的唯一ID
        this.minDiff = minDiff;   // min值的差异
        this.maxDiff = maxDiff;   // max值的差异
        this.left = left;         // 左孩子节点
        this.right = right;       // 右孩子节点
        this.leftIndex = leftIndex;   // 左孩子的索引
        this.rightIndex = rightIndex; // 右孩子的索引
    }
}


// 定义 SegmentTree 类
class SegmentTree {
    constructor(tableName, flagBuffer,maxNodes) {
        this.root = null;          // 根节点
        this.realDataNum = maxNodes
        //this.nodes = new Array(maxNodes).fill(null);
        this.nodes = {}
        this.table_name = tableName;   // 数据库中的表名，命令行传入
        this.flag = flagBuffer;     // 读取的 flag 二进制数组
        this.cache = null

        //
        this.minDLL = new DLL()
        this.maxDLL = new DLL()
    }

    // 添加节点方法
    addNode(sTime, eTime, level, index, i, min, max, id, minDiff, maxDiff, left = null, right = null, leftIndex = null, rightIndex = null) {
        const node = new SegmentTreeNode(sTime, eTime, level, index, i, min, max, id, minDiff, maxDiff, left, right, leftIndex, rightIndex);
        if (this.root === null) {
            this.root = node;     // 如果根节点为空，则设置为根节点
        }
        this.nodes[index] = new SegmentTreeNode(sTime, eTime, level, index, i, min, max, id, minDiff, maxDiff, left, right, leftIndex, rightIndex);    // 将节点添加到数组中
        return node;
    }

    // 获取所有节点
    getNodes() {
        return this.nodes;
    }
}

// 从数据库读取表 b 数据
async function readTableBFromDB(querySQL) {
    try {
        //console.log(querySQL)
        queryCounts++
        //console.log(`${queryCounts}th query`)
        //console.time('readTableBFromDB'); // 开始计时
        const result = await pool.query(querySQL);
        //console.timeEnd('readTableBFromDB'); // 结束计时并打印结果
        //console.log(``)
        // 使用 `map` 将 minvd 和 maxvd 转换为数字类型
        return result.rows.map(row => [row.i, Number(row.minvd), Number(row.maxvd)]);
    } catch (error) {
        console.error('读取数据库表 b 发生错误:', error);
        //process.exit(1);
    }
}

// 从缓存读取表 b 数据
async function readTableBFromCache(tree, ids, maxId) {
    //从数据库初始化cache

    if(tree.cache == null){
        let querySQL =  `SELECT i,minvd,maxvd FROM ${tree.table_name}  where i<= ${MAXNODENUM} ORDER by i ASC`;
        tree.cache = await readTableBFromDB(querySQL);  // 从数据库读取表 b
        //console.log('tree.cache.length',tree.cache.length)
    }

    if(maxId > 0){
        let table_b = tree.cache.slice(0, maxId+1)
        return table_b
    }

    if(ids!= null){
        let table_b = []
        for(let i=0;i<ids.length;i++){
            if(ids[i] < tree.cache.length){
                table_b.push(tree.cache[ids[i]])
            }
        }

        return table_b
    }

}

// 读取 flagz 文件并解析成 table_c 的格式
function readFlagzFile(filePath) {
    try {
        const bufferData = fs.readFileSync(filePath);
        const table_c = [];



        // 解析 bufferData 的每两项构成一个 [left, right] 对
        for (let i = 0; i < bufferData.length; i += 2) {
            const left = bufferData[i];
            const right = bufferData[i + 1];
            table_c.push([left, right]);
        }

        return table_c;
    } catch (error) {
        console.error('读取 flagz 文件时发生错误:', error);
        process.exit(1);
    }
}

function readFlagz(filePath) {
    try {
        const bufferData = fs.readFileSync(filePath);

        return bufferData;
    } catch (error) {
        console.error('读取 flagz 文件时发生错误:', error);
        process.exit(1);
    }
}

// CompletedNode 类
class CompletedNode {
    constructor() {
        this.needComputeSegmentTreeNode = null;

        this.isCompletedMax = false;
        this.isCompletedMin = false;

        this.alternativeNodesMax = [];
        this.alternativeNodesMin = [];

        this.currentComputingNodeMax = null;
        this.currentComputingNodeMin = null;
        
    }
}

class M4 {
    constructor(){
        this.max = -Infinity
        this.min = Infinity
        this.start_time = 0
        this.end_time = 0
        this.st_v = 0
        this.et_v = 0

        //一个M4代表一个像素列
        this.innerNodes = []    //像素列内的node
        this.stNodeIndex = null   //像素列左边界的node index
        this.etNodeIndex = null   //像素列内右边界node index

        //跟计算有关的
        this.alternativeNodesMax = []
        this.alternativeNodesMin = [];
        this.currentComputingNodeMax = null
        this.currentComputingNodeMin = null
        this.isCompletedMax = false;
        this.isCompletedMin = false;

        //跟计算均值有关
        this.stInterval = null
        this.etInterval = null
        this.minDLL = null
        this.maxDLL = null
        this.stNodes = []
        this.etNodes = []

    }
    
}

class Interval{
    constructor(sTime,eTime){
        this.sTime = sTime
        this.eTime = eTime
        this.nodes = []
        this.isSame = false
    }

}



// Multi_Compute函数
function multiCompute(SegmentTree1, SegmentTree2, width, symbol) {
    const M4_array = computeM4SE(width, 0, realDataRowNum);
    queryAndCompute(SegmentTree1, SegmentTree2, symbol, M4_array, width);
}

// 查询和计算函数
async function queryAndCompute(SegmentTree1, SegmentTree2, symbol, M4_array, width) {
    const computeArray = [];
    const computeArrayUnquery = [];

    let i = 0;
    let j = 0;  // 假设StartIndex=0, EndIndex初始化为树的节点数

    while (i < M4_array.length && j < SegmentTree1.getNodes().length) {
        const treeNode = SegmentTree1.getNodes()[j];
        const M4 = M4_array[i];
        const type = isContain(treeNode, M4);

        switch (type) {
            case 4:
            case 6:
            case 7:
            case 8:
                // 分裂并继续计算
                computeArrayUnquery.push(treeNode);
                j++;
                break;
            case 5:
                // 节点符合条件，加入计算数组
                computeArray.push(j);
                j++;
                break;
            case 9:
                i++;
                break;
        }
    }

    // 查询未查询的节点
    const result = await Multi_Query(computeArrayUnquery,[], [SegmentTree1, SegmentTree2]);

    // 处理查询结果
    computeArray.push(result);

    // 最终计算并将结果转化为M4_array
    const completedNodes = Multi_Compute(computeArray, [SegmentTree1, SegmentTree2], symbol);
    to_M4_array(completedNodes, M4_array);

    // 返回最终结果
    return M4_array;
}

function isSingleLeaf(node){
    if(node.eTime - node.sTime <1){
        return true
    }

    return false 
}
function isUnSingleLeaf(node){
    if(node.eTime - node.sTime == 1){
        return true
    }

    return false 
}

// 查询是否包含,待测试，看测试报告
function isContain(node, m4){
    //是叶子节点
    
    if(isSingleLeaf(node)){
        switch(true){
            case node.eTime < m4.start_time:
                return -1;break; //Node在M4左边；
            case node.sTime == m4.start_time:
                return -2;break;//Node与M4左边界重合
            case node.sTime > m4.start_time && node.sTime < m4.end_time:
                return -3;break;//Node在M4内部；
            case node.sTime == m4.end_time:
                return -4;break;//Node与M4右边界重合；
            case node.sTime > m4.end_time:
                return -5;break;//Node在M4右边；
            default:
                return 0;break;
        }
    }
    else{//非叶子节点
        switch(true){
            case node.eTime < m4.start_time:
                return 1;break;//Node完全在M4的左边；
            case node.eTime == m4.start_time:
                return 2;break;//Node右边界与M4左边界重合
            case node.sTime < m4.start_time  && node.eTime > m4.start_time :
                return 3;break;//Node跨过M4左边界；
            case node.sTime == m4.start_time /* && node.eTime < m4.end_time */:
                return 4;break;//Node左边界与M4左边界重合；
            case node.sTime > m4.start_time  && node.eTime < m4.end_time:
                return 5;break;//Node在M4内部；
            case /* node.sTime > m4.start_time && */ node.eTime == m4.end_time:
                return 6;break;//Node右边界与M4右边界重合
            case /* node.sTime > m4.start_time &&*/ node.eTime > m4.end_time && node.sTime < m4.end_time:
                return 7;break;//Node跨过M4右边界；
            case node.sTime == m4.end_time:
                return 8;break;//Node左边界与M4右边界重合
            case node.sTime > m4.end_time:
                return 9;break;//Node完全在M4的右边；
            default:
                return 0;break;
        }
    }
}

// 计算 M4 数组，//to repair
function computeM4TimeSE222(width,timeRange){
    const res = []
    for(i = 0;i<width;i ++){
        res.push(new M4())
    }
    const timeRangeLength = timeRange[1] - timeRange[0] + 1
    const startTime = timeRange[0]
    const timeGap = Math.ceil(timeRangeLength/width)

    const minSegmentIndex = Math.floor(width * (timeRange[0]-startTime)/timeRangeLength)
    const maxSegmentIndex = Math.floor(width * (timeRange[1]-startTime)/timeRangeLength)

    let previousSegmentIndex = minSegmentIndex

    for(let i = minSegmentIndex;i<=maxSegmentIndex;i++){
        const relativeStartTime = i * timeRangeLength / width + startTime
        const relativeEndTime = (i + 1) * timeRangeLength / width + startTime
        const segmentStart = Math.ceil(relativeStartTime)
        const segmentEnd = Math.floor(relativeEndTime)

        if(segmentStart <= segmentEnd){
            res[i].start_time = segmentStart
            res[i].end_time = segmentEnd
        }
        previousSegmentIndex = i
    }
    return res
}

function computeM4TimeSE(width,timeRange){

    const res = []
    for(i = 0;i<width;i ++){
        res.push(new M4())
    }

    let globalStart = timeRange[0]
    let globalEnd = timeRange[1]

    //timeRangeLength个点，分给width个桶
    const timeRangeLength = globalEnd - globalStart + 1

    // 平均每个桶，分的点数
    const everyNum = timeRangeLength/width

    // 第一个M4，以globalStart开始
    res[0].start_time = globalStart;
    //res[0].end_time = Math.ceil(everyNum) - 1


    for(i = 1;i<width;i ++){

        // 当前M4开始，是上一个M4开始+平均每个桶分的点数，向上取整
        res[i].start_time=Math.ceil( i * everyNum)

        // 上一个M4结尾，是下一个M4开始-1
        res[i-1].end_time = res[i].start_time - 1

    }

    //最后一个M4，以globalEnd结尾
    res[width-1].end_time=globalEnd

    return res
}


// 计算函数
function sympleCalculate(min1, max1, min2, max2, operator, destination) {
    if (destination === 'min') {
        switch (operator) {
            case '+':
                return Math.min(min1 + min2, min1 + max2, max1 + min2, max1 + max2);
            case '-':
                return Math.min(min1 - min2, min1 - max2, max1 - min2, max1 - max2);
            case '*':
                return Math.min(min1 * min2, min1 * max2, max1 * min2, max1 * max2);
            case '/':
                return Math.min(min1 / min2, min1 / max2, max1 / min2, max1 / max2);
        }
    } else if (destination === 'max') {
        switch (operator) {
            case '+':
                return Math.max(min1 + min2, min1 + max2, max1 + min2, max1 + max2);
            case '-':
                return Math.max(min1 - min2, min1 - max2, max1 - min2, max1 - max2);
            case '*':
                return Math.max(min1 * min2, min1 * max2, max1 * min2, max1 * max2);
            case '/':
                return Math.max(min1 / min2, min1 / max2, max1 / min2, max1 / max2);
        }
    }
}











//============================
//todo


//extremes是一个数组，返回一个数组，数组包含：min、max、以及extremes中在min和max之间的
function generateXs(min, extremes, max){

    let x = []

    for(let i=0;i<extremes.length;i++){
        if(extremes[i] > min && extremes[i] < max){
            x.push(extremes[i])
        }
    }

    x.push(min)
    x.push(max)

    return x
}


// 返回Ys中的最大/最小值
function getMin(Ys){

}

function getMax(Ys){

}


//统一的计算，既可以单条，也可以多条,trees计算对象，func计算函数，+-*/或其他复杂函数，mode：single or multi
function unifiedCalulate(trees, currentComputingNodeIndex, func, mode){

    if(currentComputingNodeIndex == null){
        return {
            tmpmin: null,
            tmpmax: null
        }
    }

    let tmpmin = 0;
    let tmpmax = 0;
    if(mode == 'multi'){
        //写一个min、max的计算的排列组合，目前用sympleCalculate暂代。
        tmpmin = sympleCalculate(
            trees[0].nodes[currentComputingNodeIndex].min
           ,trees[0].nodes[currentComputingNodeIndex].max
           ,trees[1].nodes[currentComputingNodeIndex].min
           ,trees[1].nodes[currentComputingNodeIndex].max
           ,func.funName,'min');

        tmpmax = sympleCalculate(
            trees[0].nodes[currentComputingNodeIndex].min
            , trees[0].nodes[currentComputingNodeIndex].max
            , trees[1].nodes[currentComputingNodeIndex].min
            , trees[1].nodes[currentComputingNodeIndex].max
            , func.funName, 'max');

        return {
            tmpmin: tmpmin,
            tmpmax: tmpmax
        }
    }else if(mode == 'single' || true){
        Xs = generateXs(trees[0].nodes[currentComputingNodeIndex].min, func.extremes, trees[0].nodes[currentComputingNodeIndex].max)
        Ys = func.computes(Xs)
        tmpmin = Math.min(...Ys)
        tmpmax = Math.max(...Ys)

        return {
            tmpmin: tmpmin,
            tmpmax: tmpmax
        }
    }

    
}

// 转换为M4数组
function to_M4_array(completedNodes, M4_array) {
    
}











// function createPool(dbConfig)
// {
//     let pool = new Pool({
//         user: dbConfig['username'],
//         host: dbConfig["hostname"],
//         database: dbConfig['db'],
//         password: dbConfig['password'],
//     });

//     return pool
    
// }

// 根据宽度构建树
async function buildtree(dataset1,width, screenStart,screenEnd){
    const path = require('path');
    // 从命令行获取表名
    let tableName = dataset1
    let flagzFileName = `${tableName}.flagz`;  // 根据表名自动生成 flagz 文件名
    let flagzFilePath = path.join(__dirname, '../flags', flagzFileName);

    //console.time('readFlagz'); // 开始计时

    //const table_c = readFlagzFile(flagzFilePath);  // 读取并解析 flagz 文件
    const flagBuffer = readFlagz(flagzFilePath);
    const segmentTree = new SegmentTree(tableName, flagBuffer,MAXNODENUM); 

    segmentTree.realDataNum = flagBuffer.length

    //console.timeEnd('readFlagz'); // 结束计时并打印结果


    if (!tableName) {
        console.error("请提供表名作为参数。");
        process.exit(1);
    }

    const level = Math.ceil(Math.log2(width))

    const max_id = 2 ** (level)-1;
    const querySQL = `SELECT i,minvd,maxvd FROM ${tableName}  where i<= ${max_id} ORDER by i ASC`;
    
    

    //console.time('read data from DB'); // 开始计时
    const table_b = await readTableBFromDB(querySQL);  // 从数据库读取表 b
    //const table_b = await readTableBFromCache(segmentTree, null, max_id)
    //console.timeEnd('read data from DB'); // 结束计时并打印结果

    //console.log('table_b',table_b)
    //console.log('table_b_dd',table_b_dd)

    let current_level = [];

    const max_level = Math.floor(Math.log2(flagBuffer.length/2)) + 1;  // 树的最大层数

    // 初始化根节点
    let sTime = 0;
    let eTime = flagBuffer.length-1


    const rootNode = segmentTree.addNode(sTime, eTime, 0, 0, 0, table_b[0][1], table_b[0][2], 0, null, null);
    current_level.push(rootNode);

    
   // console.time('build tree Branches'); // 开始计时

    let cnt = 0;  // 节点ID从1开始
    // 从第二行开始遍历表b，逐层构建树，直到构建到第 n+1 层
    for (let i = 1; i < table_b.length; i++) {
        const current_diff_min = table_b[i][1];
        const current_diff_max = table_b[i][2];
        const parent_node = current_level.shift();



        const level = parent_node.level + 1;  // 层级是父节点层级加1
        const position_in_level = i - (2 ** level);  // 计算i值
        const left_index = 2*parent_node.index + 1;  // 左孩子索引
        const right_index = 2*parent_node.index + 2;  // 右孩子索引

        let left_node_min, right_node_min, left_node_max, right_node_max;

        if (current_diff_min === null && current_diff_max === 0) {
            left_node_min = null;
            left_node_max = null;
            right_node_min = parent_node.min;
            right_node_max = parent_node.max;
        } else if (current_diff_min === 0 && current_diff_max === null) {
            left_node_min = parent_node.min;
            left_node_max = parent_node.max;
            right_node_min = null;
            right_node_max = null;
        } else {
            if (current_diff_min <= 0) {
                left_node_min = parent_node.min;
                right_node_min = left_node_min - current_diff_min;
            } else {
                right_node_min = parent_node.min;
                left_node_min = right_node_min + current_diff_min;
                
            }

            if (current_diff_max <= 0) {
                right_node_max = parent_node.max;
                left_node_max = right_node_max + current_diff_max;
                
            } else {
                left_node_max = parent_node.max;
                right_node_max = left_node_max - current_diff_max;
            }
        }
        sTime = parent_node.sTime
        eTime = Math.floor((parent_node.eTime+parent_node.sTime)/2)
        const left_node = segmentTree.addNode(sTime, eTime, level, left_index,   null, left_node_min, left_node_max,   left_index, null, null, null,null, null, null);
      
        sTime = Math.floor((parent_node.eTime+parent_node.sTime)/2) + 1
        eTime = parent_node.eTime
        const right_node = segmentTree.addNode(sTime, eTime, level, right_index, null, right_node_min, right_node_max, right_index, null, null, null, null, null);

        parent_node.leftIndex = left_index;
        parent_node.rightIndex = right_index;

        if (left_node.min !== null || left_node.max !== null) current_level.push(left_node);
        if (right_node.min !== null || right_node.max !== null) current_level.push(right_node);
    }

   // console.timeEnd('build tree Branches'); // 结束计时并打印结果

 
  //  console.time('build tree Leaves'); // 开始计时

    //目前假设树足够深，width较小，因此不会构建到树的叶子层，所以用不到flag。
    if (width > flagBuffer.length / 2) {
        for (let i = 0; i < flagBuffer.length; i += 2) {
            const leftFlag = flagBuffer[i];
            const rightFlag = flagBuffer[i + 1];

            const parentIndex = flagBuffer.length / 2 - 1 + i / 2;  // 计算对应的父节点索引
            const parentNode = segmentTree.nodes[parentIndex];

            if (parentNode === null) {
                continue; // 跳过空的父节点
            }
            const left_index = 2 * parentNode.index + 1;
            const right_index = 2 * parentNode.index + 2;


            // 如果 left 和 right 都为 00
            if (leftFlag === 0 && rightFlag === 0) {

                sTime = parentNode.sTime
                eTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2)

                const leftNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, left_index, null, parentNode.max, parentNode.max, left_index, null, null, null, null, null, null);

                sTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2) + 1
                eTime = parentNode.eTime
                const rightNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, right_index, null, parentNode.min, parentNode.min, right_index, null, null, null, null, null);
                //parentNode.left = leftNode;
                //parentNode.right = rightNode;
            }
            // 如果 left 和 right 都为 11
            else if (leftFlag === 1 && rightFlag === 1) {

                sTime = parentNode.sTime
                eTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2)

                const leftNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, left_index, null, parentNode.min, parentNode.min, left_index, null, null, null, null, null, null);

                sTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2) + 1
                eTime = parentNode.eTime
                const rightNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, right_index, null, parentNode.max, parentNode.max, right_index, null, null, null, null, null);
                //parentNode.left = leftNode;
                //parentNode.right = rightNode;
            }
            // 如果 left 为 1，right 为 0
            else if (leftFlag === 1 && rightFlag === 0) {
                sTime = parentNode.sTime
                eTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2)

                const leftNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, left_index, null, parentNode.min, parentNode.max, left_index, null, null, null, null, null, null);
                //parentNode.left = leftNode;
                //parentNode.right = null; // 右子节点为空
            }
            // 如果 left 为 0，right 为 1
            else if (leftFlag === 0 && rightFlag === 1) {

                parentNode.left = null;
                sTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2) + 1
                eTime = parentNode.eTime
                const rightNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, right_index, null, parentNode.min, parentNode.max, right_index, null, null, null, null, null);
                //parentNode.right = rightNode;
            }
        }


    }

   // console.timeEnd('build tree Leaves'); // 结束计时并打印结果

    return segmentTree
}

//获取树中实际的数据，注意：不是树包含的数据，因为如果对应的原始时间序列，
//不满足2的整数次幂的话，是要在结尾补null的，而我们要获取的，是原始时间序列的数据个数,即去掉结尾的null之后的个数
function getRealDataRowNum(segmentTree){
    return segmentTree.realDataNum
}

//获取树中实际的数据，注意：不是树包含的数据，因为如果对应的原始时间序列，
//不满足2的整数次幂的话，是要在结尾补null的，而我们要获取的，是原始时间序列的数据个数,即去掉结尾的null之后的个数
function getRealDataRowNum_old(segmentTree){
    for(let i = segmentTree.flag.length - 1; i >= 0; i--){
        if(segmentTree.flag[i] != null){
            if(segmentTree.flag[i] == 0){
                if(segmentTree.flag[i - 1] == 0){
                    return i + 1;
                } else{
                    return i;
                }
            } else{
                return i + 1;
            }
        }        
    }
}

//获取树最低层的第一个节点StartIndex和最后一个节点的EndIndex
// 如果树不是满的，则需要修改代码。
//获取树最低层的第一个节点StartIndex和最后一个节点的EndIndex
function getTreeLastSE(segmentTree1, width, screenStart, screenEnd){

    const level = Math.ceil(Math.log2(width))

    const max_index = 2 ** (level + 1) - 2;
    return  {
        StartIndex: max_index / 2,
        EndIndex: max_index
    };
}

async function getTableBFromDB(segmentTree, indexArray){
    let indexset = [];
    for(let i=0;i<indexArray.length;i++){
        // if(segmentTree.nodes[i] != null){
        //     continue
        // }
        indexset.push(parentIndex(indexArray[i]))
    }

    if(indexset.length == 0){
        return
    }

    //去重
    indexset = Array.from(new Set(indexset));
    

    // 一次性读出数据
    let querySQL = `SELECT i, minvd, maxvd FROM ${segmentTree.table_name} where i in (`;
    for(let a = 0; a < indexset.length - 1; a++){
        querySQL = querySQL.concat(`${indexset[a] + 1}, `);
    }
    querySQL = querySQL.concat(`${indexset[indexset.length - 1] + 1}) ORDER BY i ASC ;`);

    let table_b = await readTableBFromDB(querySQL);

    return table_b

}

async function getTableBFromCache(segmentTree, indexArray){
    let ids = [];
    for(let i=0;i<indexArray.length;i++){
        ids.push(parentIndex(indexArray[i]) + 1)
    }

    if(ids.length == 0){
        return
    }

    //去重
    ids = Array.from(new Set(ids));
    let table_b = await readTableBFromCache(segmentTree, ids, -1)

    return table_b

}

async function Query(indexArray, leaves, segmentTree){
    
     let indexset = new Set(indexArray);
     let parents = []

    for(let i=0;i<leaves.length;i++){
        let index = leaves[i]
        //let parent_index = parentIndex(index);
        //如果父节点是空，则需要将其父节点及其祖宗一起查询并构建。
        if(segmentTree.nodes[index]==null && !indexset.has(index)){
            let route = findRoute(segmentTree, index, indexset);
            parents.push(...route)
        }
    }


    if(parents.length>0){
        parents.forEach(item => indexset.add(item));
    }
    if(leaves.length >0){
        leaves.forEach(item => indexset.add(item));
    }

    //去重

    indexset = Array.from(indexset);

 
    //let table_b = await getTableBFromCache(segmentTree,indexArray)
    let table_b = await getTableBFromDB(segmentTree,indexset)


    let tableb_map = new Map();
    table_b.forEach(e =>{
        tableb_map.set(e[0], [e[0], e[1], e[2]]);
    })

    // for(let i=0;i<table_b.length;i++){
    //     tableb_map.set(table_b[i][0], [table_b[i][0], table_b[i][1], table_b[i][2]]);
    // }

    
    // let flags = []
    // indexArray.forEach(index =>{
    //     if(isLeafNode(segmentTree, index)){
    //         flags.push(readFlag(segmentTree, index));
    //     } else{
    //         flags.push(null);
    //     }
    // })

    
    //indexset = indexset.concat(indexArray);
    indexset.sort(function(a, b){return a - b});
    indexset.forEach(index =>{
        if(segmentTree.nodes[index] == null){
            let parent_index = parentIndex(index);
            let parent_node = segmentTree.nodes[parent_index];
            let {sTime, eTime} = getSETimeByIndex(segmentTree, index);
                
            let min = parent_node.min;
            let max = parent_node.max;
            let level = parent_node.level;
            let i = parent_node.i; 

            if(!isLeafNode(segmentTree, index)){
                current_diff_min = tableb_map.get(parent_index + 1)[1];
                current_diff_max = tableb_map.get(parent_index + 1)[2];
                
                if(isLeftNode(index)){
                    if(current_diff_min < 0){}
                    else{
                        min = min + current_diff_min;
                    }
    
                    if(current_diff_max < 0){
                        max = max + current_diff_max;
                    } else{}
                    
                    i = 2 * i;
                } else{
                    if(current_diff_min < 0){
                        min = min - current_diff_min;
                    } else{}

                    if(current_diff_max < 0){} 
                    else{
                        max = max - current_diff_max;
                    }

                    i = 2 * i + 1;
                }

                let new_node = new SegmentTreeNode(sTime, eTime, level + 1, index, i, min, max, index);
                //segmentTree.addNode(index, new_node);
                segmentTree.nodes[index] = new_node


            } else{
                let flag = readFlag(segmentTree, index);
                if(flag[0]==1 && flag[1]==0){
                    i = 2 * i;
                } else if(flag[0]==0 && flag[1]==1){
                    i = 2 * i + 1;                   
                } else if(flag[0]==0 && flag[1]==0){
                    if(isLeftNode(index)){
                        min = max;
                        i = 2 * i;
                    } else{
                        max = min;
                        i = 2 * i + 1;
                    }
                } else if(flag[0]==1 && flag[1]==1){
                    if(isLeftNode(index)){
                        max = min;
                        i = 2 * i;
                    } else{
                        min = max;
                        i = 2 * i + 1;
                    }
                }
                let new_node = new SegmentTreeNode(sTime, eTime, level + 1, index, i, min, max, index); 
                //segmentTree.addNode(index, new_node)
                segmentTree.nodes[index] = new_node
            }
        }
    })

}

//根据indexArray，从数据库中查询到相应的信息，并计算出相应的树节点，分别补充到SegmentTrees中
async function Multi_Query(indexArray,leaves, segmentTrees){

    timestart('Multi_Query');

    let indexArray2 = []
    for(let i=0;i<indexArray.length;i++){
        if(segmentTrees[0].nodes[indexArray[i]] == null){
            indexArray2.push(indexArray[i])
        }
    }
    if(indexArray2.length == 0 && leaves.length == 0 ){
        return
    }

    for(let i = 0; i < segmentTrees.length; i++){
        await Query(indexArray2, leaves, segmentTrees[i]);
    }

    timeend('Multi_Query');

}


function getChildren(segmentTree1, index){
    let { leftIndex, rightIndex } = getChildrenIndex(index);
    let leftChild = new SegmentTreeNode()
    let { sTime:sTime1, eTime:eTime1 } = getSETimeByIndex(segmentTree1, leftIndex);
    leftChild.sTime = sTime1
    leftChild.eTime = eTime1
    leftChild.index = leftIndex

    let rightChild = new SegmentTreeNode()
    let { sTime:sTime2, eTime:eTime2 } = getSETimeByIndex(segmentTree1, rightIndex);
    rightChild.sTime = sTime2
    rightChild.eTime = eTime2
    rightChild.index = rightIndex

    return {
        leftChild:leftChild,
        rightChild:rightChild
    }
}


//对node节点延m4边界向下查询，直至查询到底层，并把查询到的树节点的Index返回。
//并将分裂的节点，加入到对应的M4中,同时要计算分裂后的每个node对应的时间范围，因为需要根据时间范围，不断分裂到底层
//对node节点延m4边界向下查询，直至查询到底层，并把查询到的树节点的Index返回。
//并将分裂的节点，加入到对应的M4中,同时要计算分裂后的每个node对应的时间范围，因为需要根据时间范围，不断分裂到底层

//整体上，devisionNodeIndex的左右就是，对node不断分裂，填充每个M4的 stnode、innernode、etnode
function devisionNodeIndexAVG( segmentTree1, node, M4_array, i, leaves){

    let m4 = M4_array[i]

    let {typeS, typeE}  = isContainAVG(node, m4)
    let type = isContain(node, m4)




    //对叶子结点
    if(isSingleLeaf(node)){
        //叶子Node与在m4 stInterval内部
        if(typeS == 3){
            if(m4.stInterval.isSame){
                return []
            }
            m4.stInterval.nodes.push(node.index)   
            return []
        }

        //叶子Node在M4内部，放到该M4的inner中
        if(typeS == 6 && typeE == 1){
           m4.innerNodes.push(node.index)
            return []
        }

        //叶子Node与在m4 etInterval内部
        if(typeE == 3){
            m4.etInterval.nodes.push(node.index) 
            return []
        }
        return []
    }

// 对 非叶子节点

    if (typeS == 1 || typeS == 2 || typeS == 5) {
        //typeS = 1\2\3,属于一部分在前一个M4，一部分在(i)M4，这种情况也不管，前一个M4已经进行了处理，
        return []
    }

    if (typeS == 3 || typeS == 4 || typeS == 5) {
        if (m4.stInterval.isSame) {
            // 当前m4 的stInterval与前一个m4的etInterval重合，这种情况也不管，前一个M4已经进行了处理
            return []
        }
    }


    // 对非叶子节点，分裂其左右孩子
    
    let{leftChild, rightChild} = getChildren(segmentTree1,node.index)

    let needQuerysIndex = []
    let tt = []




    if(typeS == 1){
        return []
    }

    if(typeS == 2){
        if(m4.stInterval.isSame){
            return []
        }

        //保存向下分裂后需要查询的index,先把当前分裂的左右孩子放进去
        needQuerysIndex.push(...[leftChild.index,rightChild.index])

        //递归的向左右孩子分裂
        let tmpIndex1 = devisionNodeIndexAVG( segmentTree1, leftChild, M4_array, i, leaves)
        needQuerysIndex.push(...tmpIndex1)
        let tmpIndex2 = devisionNodeIndexAVG( segmentTree1, rightChild, M4_array, i, leaves)
        needQuerysIndex.push(...tmpIndex2)
        return needQuerysIndex
    }

    if(typeS == 3){
        if(m4.stInterval.isSame){
            return []
        }

         //node 完全在m4开始interval的内部，这个node需要分裂到叶子结点，并给interval提供计算
         tt = getLeaves(segmentTree1, node.sTime, node.eTime)
         m4.stInterval.nodes.push(...tt)
         leaves.push(...tt)

        return needQuerysIndex
    }

    if(typeS == 4 || typeS == 5){
        if(typeE == 1 || typeE == 2){
           

            needQuerysIndex.push(...[leftChild.index,rightChild.index])
            //递归的向左右孩子分裂
            let tmpIndex1 = devisionNodeIndexAVG( segmentTree1, leftChild, M4_array, i, leaves)
            needQuerysIndex.push(...tmpIndex1)
            let tmpIndex2 = devisionNodeIndexAVG( segmentTree1, rightChild, M4_array, i, leaves)
            needQuerysIndex.push(...tmpIndex2)
        }

        //不仅与M4_array[i]这一个M4有关，还与下一个M4_array[i+1]这个M4有关
        if(typeE == 5){

            needQuerysIndex.push(...[leftChild.index,rightChild.index])
            //递归的向左右孩子分裂   i  
            let tmpIndex1 = devisionNodeIndexAVG( segmentTree1, leftChild, M4_array, i, leaves)
            needQuerysIndex.push(...tmpIndex1)
            let tmpIndex2 = devisionNodeIndexAVG( segmentTree1, rightChild, M4_array, i, leaves)
            needQuerysIndex.push(...tmpIndex2)

            //递归的向左右孩子分裂   i+1
            if (i + 1 < M4_array.length) {
                let tmpIndex3 = devisionNodeIndexAVG( segmentTree1, leftChild, M4_array, i + 1, leaves)
                needQuerysIndex.push(...tmpIndex3)
                let tmpIndex4 = devisionNodeIndexAVG( segmentTree1, rightChild, M4_array, i + 1, leaves)
                needQuerysIndex.push(...tmpIndex4)
            }
        }

       return needQuerysIndex
    }

    if(typeS == 6){
        if(typeE == 1){
            //node 完全在m4开始interval的右边，结束interval的左边，说明该node是innernode
            m4.innerNodes.push(node.index)
            return []
        }

        if(typeE == 2){
            needQuerysIndex.push(...[leftChild.index,rightChild.index])
            //递归的向左右孩子分裂   i  
            let tmpIndex1 = devisionNodeIndexAVG( segmentTree1, leftChild, M4_array, i, leaves)
            needQuerysIndex.push(...tmpIndex1)
            let tmpIndex2 = devisionNodeIndexAVG( segmentTree1, rightChild, M4_array, i, leaves)
            needQuerysIndex.push(...tmpIndex2)

            return needQuerysIndex
        }

        if(typeE == 3){
             //node 完全在m4结束interval的内部，这个node需要分裂到叶子结点，并给interval提供计算
             tt = getLeaves(segmentTree1, node.sTime, node.eTime)
             m4.etInterval.nodes.push(...tt)
             leaves.push(...tt)

             return needQuerysIndex
        }

        //不仅与M4_array[i]这一个M4有关，还与下一个M4_array[i+1]这个M4有关
        if(typeE == 4 || typeE == 5){

            needQuerysIndex.push(...[leftChild.index,rightChild.index])
            //递归的向左右孩子分裂   i  
            let tmpIndex1 = devisionNodeIndexAVG( segmentTree1, leftChild, M4_array, i, leaves)
            needQuerysIndex.push(...tmpIndex1)
            let tmpIndex2 = devisionNodeIndexAVG( segmentTree1, rightChild, M4_array, i, leaves)
            needQuerysIndex.push(...tmpIndex2)

            //递归的向左右孩子分裂   i+1
            if (i + 1 < M4_array.length) {
                let tmpIndex3 = devisionNodeIndexAVG( segmentTree1, leftChild, M4_array, i + 1, leaves)
                needQuerysIndex.push(...tmpIndex3)
                let tmpIndex4 = devisionNodeIndexAVG( segmentTree1, rightChild, M4_array, i + 1, leaves)
                needQuerysIndex.push(...tmpIndex4)
            }

            return needQuerysIndex
        }


        if(typeE == 6){
            //全部分在下一个，(i+1)M4，则分给下一个M4
        //貌似也不用管？？？

            return []
        }
    }

}

//根据computeArrayUnqueryIndex，从数据库中查询到相应的信息，并计算出相应的树节点，分别补充到SegmentTrees中


function getChildrenIndex(index){

    return {
        leftIndex: 2 * index + 1,
        rightIndex: 2 * index + 2
    };

    
    return {
        leftIndex: 0,
        rightIndex: 63
    };
    
}


//根据segmentTree的结构，返回index节点的sTime和eTime
function getSETimeByIndex(segmentTree, index){
    let srange = segmentTree.root.sTime;
    let erange = segmentTree.root.eTime;
    let level = Math.floor(Math.log2(index + 1));
    let i = index - 2 ** level + 1; 
    let interval = (erange - srange + 1) / (2 ** level);
    let sTime = srange + i * interval;
    let eTime = sTime + interval - 1;
    return  {
        sTime: sTime,
        eTime: eTime
    };
}


// 判断是否为叶子节点
function isLeafNode(segmentTree, index){
    return index >= segmentTree.flag.length - 1;
}

// 寻找叶子节点的位置
function getPosition(segmentTree, index){
    if(isLeafNode(segmentTree, index)){
        return index - segmentTree.flag.length + 1;
    } else{
        console.log(`This node whose index = ${index} is not a leafnode.`);
        return -1;
    }
}

// 寻找叶子节点对应的 table_c 数据索引
function getIndexInTableC(segmentTree, index){
    return Math.floor(getPosition(segmentTree, index) / 2);
}

// 从 buffer 里读某一个叶子节点对应表c数据
function readFlag(segmentTree, index){
    if(isLeafNode(segmentTree, index)){
        let position = getPosition(segmentTree, index);
        if(segmentTree.flag[position] == null){
            return null;
        } else if(isLeftNode(index)){
            return [segmentTree.flag[position], segmentTree.flag[position + 1]];
        } else{
            return [segmentTree.flag[position - 1], segmentTree.flag[position]];
        }
    } else{
        console.log(`This node whose index = ${index} is not a leafnode.`);
        return -1;
    }
}

// 获得父节点
function parentIndex(index){
    if(!isLeftNode(index)){
        return (index - 2) / 2;
    } else{
        return (index - 1) / 2;
    }
}


// 判断节点为左或右子节点
function isLeftNode(index){
    return index % 2 != 0;
}

// 求子节点的 sTime, eTime
function getChildNodeSETime(node){
    return {
        sTime: Math.floor((node.sTime + node.eTime) / 2),
        eTime: Math.ceil((node.sTime + node.eTime) / 2)
    }
}

// 从某个存在的节点到所求节点的路径(沿途节点索引)
function findRoute(segmentTree, index, indexset){
    let route = [];
    let current_index = parentIndex(index);

    while(segmentTree.nodes[current_index] == null && !indexset.has(current_index)){
        route.push(current_index);
        current_index = parentIndex(current_index);
    }

    return route;
}
// function findRoute(segmentTree, index){
//     let route = [];
//     let current_index = index;
//     do {
//         current_index = parentIndex(current_index);
//         route.push(current_index);
//     } while(segmentTree.nodes[current_index] == null)
//     return route;
// }

// 从某个存在的节点到所求节点的路径和该存在节点
function findTrace(segmentTree, index){
    let trace = [];
    let current_index = index;
    do {
        if(current_index % 2 == 0){
            trace.push(1);// 是父节点的右子节点
        } else{
            trace.push(0);// 是父节点的左子节点
        }
        current_index = parentIndex(current_index);
    } while(segmentTree[current_index] == null)
        trace.reverse();
    return {
        trace: trace,
        exist_node: segmentTree[current_index]
    }
}

//===============================


function computeM4ValueSE(m4, segmentTrees,func, mode){


    let {tmpmin:t1, tmpmax:t2}=unifiedCalulate(segmentTrees, m4.stNodeIndex, func, mode)
    m4.st_v = t1

    let {tmpmin:t3, tmpmax:t4}=unifiedCalulate(segmentTrees, m4.etNodeIndex, func, mode)
    m4.et_v = t3



}

async function initM4(segmentTrees,M4_array,func, mode, parallel) {
    let needQueryIndex = []

    // 以M4_array中的每个M4像素列为单位，每个M4中需要计算的节点包括：innerNodes数组，start_node：左边界节点（单叶子节点），end_node：右边界节点（单叶子节点
    // 这些节点都是需要计算，但是innerNodes数组中的节点，并没有查询其孩子节点，因此其孩子为空，需要进行查询。

    // for(i=0;i<M4_array.length;i++){
    //     for(j=0;j<M4_array[i].innerNodes.length;j++){
    //         let {leftIndex, rightIndex} = getChildrenIndex(M4_array[i].innerNodes[j])
    //         needQueryIndex.push(leftIndex)
    //         needQueryIndex.push(rightIndex)
    //     }
    // }
    // await Multi_Query(needQueryIndex, segmentTrees)
    // needQueryIndex = []

    for(let i=0;i<M4_array.length;i++){
        

        //init m4
        M4_array[i].alternativeNodesMax=new MaxHeap()
        M4_array[i].alternativeNodesMin=new MinHeap()
        M4_array[i].isCompletedMax=false
        M4_array[i].isCompletedMin=false
        M4_array[i].currentComputingNodeMax = []
        M4_array[i].currentComputingNodeMin = []

        //计算边界node
        computeM4ValueSE(M4_array[i], segmentTrees,func, mode)



 


        if (M4_array[i].st_v < M4_array[i].et_v) {
            M4_array[i].min = M4_array[i].st_v
            M4_array[i].max = M4_array[i].et_v

        } else {
            M4_array[i].min = M4_array[i].et_v
            M4_array[i].max = M4_array[i].st_v
        }

        if (M4_array[i].innerNodes.length == 0) {
            M4_array[i].isCompletedMax = true
            M4_array[i].isCompletedMin = true

            continue

        }


        //计算inner node
        //将m4.innerNodes全部放入候选队列
        for(let j=0;j<M4_array[i].innerNodes.length;j++){
            let index = M4_array[i].innerNodes[j]

            let {tmpmin,tmpmax}=unifiedCalulate(segmentTrees, index, func, mode)
 

            let max_e = Object.create(element)
            max_e.value=tmpmax
            max_e.index=index
            M4_array[i].alternativeNodesMax.add(max_e)

            let min_e = Object.create(element)
            min_e.value=tmpmin
            min_e.index=index
            M4_array[i].alternativeNodesMin.add(min_e)
        }

        //计算的4步：从候选结点取，与m4.max和m4.min比较，赋给Current，获取、查询Current孩子
        let tt = huisuCompute(M4_array[i], segmentTrees, parallel);
        needQueryIndex.push(...tt)
    }



    // if(errorBoundSatisfy(M4_array, 600,600,0)){
    //     //break
    // }

    // for(let i=0;i<M4_array.length;i++){
    //     //计算的4步：从候选结点取，与m4.max和m4.min比较，赋给Current，获取、查询Current孩子
    //     let tt = huisuCompute(M4_array[i], segmentTrees, parallel);
    //     needQueryIndex.push(...tt)
    // }
   


    console.time('Multi_Query');
    //上面计算，将要计算的节点currentComputingNodeMax的孩子存储在needQueryIndex中，从数据库查询并计算
    await  Multi_Query(needQueryIndex,[], segmentTrees)
    console.timeEnd('Multi_Query');
    
}


let errorBoundSatisfyCount =0

class YRange{
    constructor(){
        this.Ymin = Infinity
        this.Ymax = -Infinity
    }
}

function getYRangeInner(valuemin,valuemax, ymin,ymax ,height){
    let yRange = new YRange()
    yRange.Ymin = ((valuemin-ymin)/(ymax-ymin))*height
    yRange.Ymax = ((valuemax-ymin)/(ymax-ymin))*height

    return yRange
}

function getYRangePre(m4_pre,boundaryPre,m4, ymin,ymax, height ){
    if(m4_pre == null){
        return null
    }

    if(m4_pre.et_v >= m4.min && m4_pre.et_v <= m4.max){
        return null
    }

    let yRange = new YRange()
    //计算 (m4_pre.end_time,m4_pre.et_v) 的交点 (m4.start_time, m4.st_v) boundaryPre
    let intersectionY =0
    if(m4_pre.et_v < m4.st_v){
        intersectionY = m4_pre.et_v + (m4.st_v-m4_pre.et_v)*(boundaryPre-m4_pre.end_time)/(m4.start_time-m4_pre.end_time)

        yRange.Ymin = ((intersectionY-ymin)/(ymax-ymin))*height
        yRange.Ymax = ((m4.st_v-ymin)/(ymax-ymin))*height

        return yRange

    }else if(m4_pre.et_v > m4.st_v){
        intersectionY = m4.st_v + (m4_pre.et_v-m4.st_v)*(m4.start_time-boundaryPre)/(m4.start_time-m4_pre.end_time)


        yRange.Ymin = ((m4.st_v-ymin)/(ymax-ymin))*height
        yRange.Ymax = ((intersectionY-ymin)/(ymax-ymin))*height

        return yRange
    }

}


function getYRangeNext(m4_next,boundaryNext,m4 , ymin,ymax, height ){
    if(m4_next == null){
        return null
    }

    if(m4_next.st_v >= m4.min && m4_next.st_v <= m4.max){
        return null
    }

    let yRange = new YRange()
    let intersectionY =0

    if(m4_next.st_v < m4.et_v){
        intersectionY = m4_next.st_v + (m4.et_v-m4_next.st_v)*(m4_next.start_time-boundaryNext)/(m4_next.start_time-m4.end_time)

        yRange.Ymin = ((intersectionY-ymin)/(ymax-ymin))*height
        yRange.Ymax = ((m4.et_v-ymin)/(ymax-ymin))*height

        return yRange

    }else if(m4_next.st_v > m4.et_v){
        intersectionY = m4.et_v + (m4_next.st_v-m4.et_v)*(boundaryNext-m4.end_time)/(m4_next.start_time-m4.end_time)

        yRange.Ymin = ((m4.et_v-ymin)/(ymax-ymin))*height
        yRange.Ymax = ((intersectionY-ymin)/(ymax-ymin))*height
        return yRange
    }

}

function getUnion(yRanges, height){
    let max = -Infinity
    let min = Infinity
    for(let i=0;i<yRanges.length;i++){
        if(yRanges[i] == null){
            continue
        }

        if(max < yRanges[i].Ymax){
            max = yRanges[i].Ymax
        }

        if(min > yRanges[i].Ymin){
            min = yRanges[i].Ymin
        }
    }

    let yRange = new YRange()
    yRange.Ymin=Math.max(min,0)
    yRange.Ymax =Math.min(max,height)

    return yRange
}

function outputpix(type,min,max, exactMin,exactMax, yRange){

    console.log(type,'min:',min,'max:',max,'ymin:',exactMin,'ymax:',exactMax,'range:',yRange)
}

function computeErrorPixelsExact2Exact(m4_pre,boundaryPre,m4,m4_next,boundaryNext 
    ,exactMax,exactMin,candidateMax,candidateMin, height, debug){

    let yRangeInner = getYRangeInner(m4.min,m4.max, exactMin,exactMax ,height)

    let yRangePre = getYRangePre(m4_pre,boundaryPre,m4, exactMin,exactMax, height )
    let yRangeNext = getYRangeNext(m4_next,boundaryNext,m4 ,exactMin,exactMax, height )

// if(errorBoundSatisfyCount == 13 || errorBoundSatisfyCount == 14 ){
//     console.log(yRangeInner,yRangePre,yRangeNext)
// }

    let yRange = getUnion([yRangeInner,yRangePre,yRangeNext], height)


    if(debug){
        outputpix('e2e',m4.min,m4.max, exactMin,exactMax, yRange)
    }

    return yRange

}

function computeErrorPixelsExact2Candidate(m4_pre,boundaryPre,m4,m4_next,boundaryNext,  
    exactMax,exactMin,candidateMax,candidateMin, height,debug){

    let yRangeInner = getYRangeInner(m4.min,m4.max, candidateMin,candidateMax ,height)
    let yRangePre = getYRangePre(m4_pre,boundaryPre,m4, candidateMin,candidateMax, height )
    let yRangeNext = getYRangeNext(m4_next,boundaryNext,m4 ,candidateMin,candidateMax, height )

    let yRange = getUnion([yRangeInner,yRangePre,yRangeNext], height)


    if(debug){
        outputpix('e2c',m4.min,m4.max, candidateMin,candidateMax, yRange)
    }

    return yRange
}

function computeErrorPixelsCandidate2Exact(m4_pre,boundaryPre,m4,m4_next,boundaryNext,  
    exactMax,exactMin,candidateMax,candidateMin, height,debug){

    let max,min
    if (m4.alternativeNodesMin.isEmpty()) {
        min = m4.min
    } else {
        let Ele = m4.alternativeNodesMin.getTop()
        min =Math.min(Ele.value,m4.min) 
    }

    if (m4.alternativeNodesMax.isEmpty()) {
        max = m4.max
    } else {
        let Ele = m4.alternativeNodesMax.getTop()
        max = Math.max(Ele.value,m4.max)
    }


    let yRangeInner = getYRangeInner(min, max, exactMin, exactMax, height)

    let yRangePre = getYRangePre(m4_pre, boundaryPre, m4, exactMin, exactMax, height)
    let yRangeNext = getYRangeNext(m4_next, boundaryNext, m4, exactMin, exactMax, height)


    let yRange = getUnion([yRangeInner, yRangePre, yRangeNext], height)


    if(debug){
        outputpix('c2e',min,max, exactMin,exactMax, yRange)
    }

    return yRange

}


function computeErrorPixelsCandidate2Candidate(m4_pre, boundaryPre, m4, m4_next, boundaryNext,
    exactMax, exactMin, candidateMax, candidateMin, height,debug) {


    let max, min
    if (m4.alternativeNodesMin.isEmpty()) {
        min = m4.min
    } else {
        let Ele = m4.alternativeNodesMin.getTop()
        min = Math.min(Ele.value, m4.min)
    }

    if (m4.alternativeNodesMax.isEmpty()) {
        max = m4.max
    } else {
        let Ele = m4.alternativeNodesMax.getTop()
        max = Math.max(Ele.value, m4.max)
    }


    let yRangeInner = getYRangeInner(min, max, candidateMin, candidateMax, height)

    let yRangePre = getYRangePre(m4_pre, boundaryPre, m4, candidateMin, candidateMax, height)
    let yRangeNext = getYRangeNext(m4_next, boundaryNext, m4, candidateMin, candidateMax, height)


    let yRange = getUnion([yRangeInner, yRangePre, yRangeNext], height)


    if(debug){
        outputpix('c2c',min,max, candidateMin,candidateMax, yRange)
    }

    return yRange
}


function getIntersection(ranges, height){

    let max = Infinity
    let min = -Infinity
    for(let i=0;i<ranges.length;i++){
        if(ranges[i] == null){
            continue
        }



        if(max > ranges[i].Ymax){
            max = ranges[i].Ymax
        }

        if(min < ranges[i].Ymin){
            min = ranges[i].Ymin
        }
    }

    let yRange = new YRange()
    yRange.Ymin=Math.max(min,0)
    yRange.Ymax =Math.min(max,height)


    return yRange


}

//range1-range2
function getDiff(range1,range2){

    let diffNum = 0
    if(range1.Ymax > range2.Ymax){
        diffNum += range1.Ymax - range2.Ymax
    }

    if(range1.Ymin < range2.Ymin){
        diffNum += range2.Ymin - range1.Ymin
    }


    return diffNum

}

// 并集函数：传入一个 ranges 数组，返回合并后的区间数组
function union(ranges) {
    if (ranges.length === 0) return [];

    let allRanges = [...ranges].sort((a, b) => a.Ymin - b.Ymin);
    let result = [];
    let current = new YRange()
    current.Ymax = allRanges[0].Ymax;
    current.Ymin = allRanges[0].Ymin;

    for (let i = 1; i < allRanges.length; i++) {
        let r = allRanges[i];
        if (current.Ymax >= r.Ymin) {
            current.Ymax = Math.max(current.Ymax, r.Ymax);
        } else {
            result.push(current);

            current = new YRange()
            current.Ymax = r.Ymax;
            current.Ymin = r.Ymin;
        }
    }
    result.push(current);
    return result;
}

// 计算差集的函数
function difference(a, b) {
    if (a.length === 0) return [];
    if (!b) return [...a]; // 如果 b 为空或未定义，直接返回 a 的副本

    let result = [];
    let bStart = b.Ymin;
    let bEnd = b.Ymax;

    for (let ra of a) {
        // 如果 `ra` 在 `b` 的左侧或右侧，则完全保留
        if (ra.Ymax <= bStart || ra.Ymin >= bEnd) {

            let newRange = new YRange()
            newRange.Ymax = ra.Ymax
            newRange.Ymin = ra.Ymin
            result.push(newRange);
        } else {
            // 有重叠部分，处理差集
            if (ra.Ymin < bStart) {
                let newRange = new YRange()
                newRange.Ymax = bStart
                newRange.Ymin = ra.Ymin
                result.push(newRange);
            }
            if (ra.Ymax > bEnd) {
                let newRange = new YRange()
                newRange.Ymax = ra.Ymax
                newRange.Ymin = bEnd
                result.push(newRange);
            }
        }
    }

    return result
}

// 交集函数：传入一个 ranges 数组，返回交集区间的数组
function intersect(ranges) {
    if (ranges.length === 0) return null

    let intersection = new YRange()
    intersection.Ymax = ranges[0].Ymax;
    intersection.Ymin = ranges[0].Ymin;

    for (let i = 1; i < ranges.length; i++) {
        const r = ranges[i];
        const newYmin = Math.max(intersection.Ymin, r.Ymin);
        const newYmax = Math.min(intersection.Ymax, r.Ymax);
        if (newYmin > newYmax) {
            return null; // 没有公共交集，直接返回空数组
        }
        intersection.Ymin = newYmin
        intersection.Ymax = newYmax//new Range(newYmin, newYmax);
    }
    return intersection; // 返回单一交集区间数组
}

function computeErrorPixels(m4_pre,boundaryPre,m4,m4_next,boundaryNext ,exactMax,exactMin,candidateMax,candidateMin, height, debug){

    let e2ePixInterval = computeErrorPixelsExact2Exact(m4_pre,boundaryPre,m4,m4_next,boundaryNext,  
        exactMax,exactMin,candidateMax,candidateMin, height, debug)

    let e2cPixInterval = computeErrorPixelsExact2Candidate(m4_pre,boundaryPre,m4,m4_next,boundaryNext,  
        exactMax,exactMin,candidateMax,candidateMin, height, debug)

    let c2ePixInterval = computeErrorPixelsCandidate2Exact(m4_pre,boundaryPre,m4,m4_next,boundaryNext,  
        exactMax,exactMin,candidateMax,candidateMin, height, debug)

    let c2cPixInterval = computeErrorPixelsCandidate2Candidate(m4_pre,boundaryPre,m4,m4_next,boundaryNext,  
        exactMax,exactMin,candidateMax,candidateMin, height, debug)
    

    //console.log(e2ePixInterval,e2cPixInterval,c2ePixInterval,c2cPixInterval)

    
    let unionRanges = union([e2ePixInterval,e2cPixInterval,c2ePixInterval,c2cPixInterval])

    //let unionRange = getUnion([e2ePixInterval,e2cPixInterval,c2ePixInterval,c2cPixInterval], height)
    let intersectionRange = intersect([e2ePixInterval,e2cPixInterval,c2ePixInterval,c2cPixInterval])

    let diffRanges = difference(unionRanges,intersectionRange)

    let totalDiffNum = 0
    for(let i=0;i<diffRanges.length;i++){
        let diffRange = diffRanges[i]
        totalDiffNum += diffRange.Ymax - diffRange.Ymin
    }


    if(debug){
        console.log('union:',unionRanges,'intersection:',intersectionRange)
    }

    return totalDiffNum
}


function getBoundary(start_time,end_time, width, i){

    return (end_time-start_time+1)/width * i
}


function errorBoundSatisfy(M4_array, width,height,errorBound){
//console.log(width,height,errorBound)

    let totalPixels = width*height

    let errorPixels = 0
    let exactMax = -Infinity
    let candidateMax = -Infinity
    let exactMin = Infinity
    let candidateMin = Infinity


    let debug = false
    //(m4.alternativeNodesMax.isEmpty() && m4.alternativeNodesMin.isEmpty())

    for(let i=0;i<M4_array.length;i++){
        let m4=M4_array[i]
        // if((m4.isCompletedMax == true && m4.isCompletedMin == true)){
        //     exactMax=m4.max
        //     exactMin = m4.min

        //     candidateMax = exactMax
        //     candidateMin = exactMin

        //     continue
        // }


        if(m4.min < exactMin){
            exactMin = m4.min
        }
        if(m4.max > exactMax){
            exactMax=m4.max
        }

        //！！！！！对单路计算可以，多路计算，还要考虑其他路情况
        if(m4.alternativeNodesMin.isEmpty()){
            if(m4.min < candidateMin){
                candidateMin = m4.min
            }
        }else{
            let Ele = m4.alternativeNodesMin.getTop()
            if(Ele.value < candidateMin){
                candidateMin = Ele.value
            }
        }

        if(m4.alternativeNodesMax.isEmpty()){
            if(m4.max > candidateMax){
                candidateMax=m4.max
            }
        }else{
            let Ele = m4.alternativeNodesMax.getTop()
            if(Ele.value > candidateMax){
                candidateMax=Ele.value
            }
        }
    }


    for(let i=0;i<M4_array.length;i++){
        let m4=M4_array[i]
        let m4_pre = null
        let m4_next = null
        let boundaryPre = M4_array[0].start_time
        let boundaryNext = M4_array[M4_array.length-1].end_time

        if(i >0){
            m4_pre = M4_array[i-1]
            boundaryPre = getBoundary(M4_array[0].start_time,M4_array[M4_array.length-1].end_time, width, i)
        }
        if(i<M4_array.length-1){
            m4_next= M4_array[i+1]

            boundaryNext = getBoundary(M4_array[0].start_time,M4_array[M4_array.length-1].end_time, width, i+1)
        }
        // if((m4.isCompletedMax == true && m4.isCompletedMin == true)){
        //     continue
        // }

        // if(errorBoundSatisfyCount == 9 || errorBoundSatisfyCount == 10){

        //     let a=0
        //     //console.log(i,' e ',e)
        // }

        // if(i == 1){
        //     debug = true
        // }

        let e = computeErrorPixels(m4_pre,boundaryPre,m4,m4_next,boundaryNext ,exactMax,exactMin,candidateMax,candidateMin, height, debug)

        // if(i == 1){
        //     //debugOutput(m4)

        //     console.log(errorBoundSatisfyCount,' e ',e)
        // }
        

        // if(e!=0 && errorBoundSatisfyCount > 95){
        //     console.log(i)
        // }

        errorPixels+= e

    }
    

     errorBoundSatisfyCount++
     console.log(errorBoundSatisfyCount,errorPixels/totalPixels)

    if(errorPixels/totalPixels <= errorBound){
        return true
    }else{
        return false
    }

}


function debugOutput(m4){
    //console.log(m4.start_time,m4.end_time)


    console.log('emin:',m4.min,' emax:',m4.max)
    //console.log(' emax:',m4.max.toFixed(2))

    let cmin = null, cmax=null, imin = null, imax = null
    if(!m4.alternativeNodesMax.isEmpty()){
        let ele = m4.alternativeNodesMax.getTop()
        imax = ele.index
        cmax = ele.value.toFixed(2)
    }

    if(!m4.alternativeNodesMin.isEmpty()){
        let ele = m4.alternativeNodesMin.getTop()
        imin = ele.index
        cmin = ele.value.toFixed(2)
    }


    console.log('cmin:',cmin,' cmax:',cmax, ' imin:',imin, ' imax',imax)
    //console.log(' cmax:',cmax, ' imax',imax)

console.log('current:',m4.currentComputingNodeMax[0])

}


//mode = single/multi
async function Start_Multi_Compute(segmentTrees,M4_array,func, mode, parallel, width,height,errorBound){

    console.time('initM4');
    await initM4(segmentTrees,M4_array,func, mode, parallel)
    console.timeEnd('initM4');

    let needQueryIndex = []


    //经过上面的处理，以及Multi_Query后，每个像素列m4里，当前要计算的节点currentComputingNodeMax，及其孩子已经查询计算得到。
    //下面开始根据currentComputingNodeMax对左右孩子进行计算
    let computedMinCount = 0
    let computedMaxCount = 0
    let computedCount = 0
    while(computedCount < M4_array.length*2 ){

        //console.log(computedCount)
        computedCount = 0
        


        for(let i=0;i<M4_array.length;i++){
            //先计算min
            if(M4_array[i].isCompletedMin){
                // to repair,bug
                computedCount++
                //console.log(computedCount)
            }
            else{
                //对M4_array[i]的Current进行计算
                CurrentCompute(M4_array[i], segmentTrees,func, 'min', mode)
            }
            
            //计算max
            if(M4_array[i].isCompletedMax){
                computedCount++
                //console.log(computedCount)
            }else{
                //对M4_array[i]的Current进行计算
                CurrentCompute(M4_array[i], segmentTrees,func, 'max', mode)
            }



            // let tt = huisuCompute(M4_array[i], segmentTrees, parallel);
            // needQueryIndex.push(...tt)

        }

        if(errorBoundSatisfy(M4_array, width,height,errorBound)){
            break
        }


        for(let i=0;i<M4_array.length;i++){
            let tt = huisuCompute(M4_array[i], segmentTrees, parallel);
            needQueryIndex.push(...tt)
        }


        //经过上面的for循环，相当于对m4像素列遍历了一遍，也就是对每个m4的 当前计算节点进行了计算，并把其左右孩子放入候选堆，
        //然后通过huisu，取出候选堆中的最优节点，并找到其孩子的index放入needQuery中
        await Multi_Query(needQueryIndex,[], segmentTrees)
        needQueryIndex = []       



    }
}


function CurrentCompute(m4, segmentTrees,func, destination, mode){


    // for Max=========================================
    for (let i = 0; destination == 'max' && i < m4.currentComputingNodeMax.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMax[i]
        //当前需要计算的节点是叶子结点, 则直接进行计算，并结束，不需要向下查询
        if (isSingleLeaf(segmentTrees[0].nodes[currentComputingNodeIndex])) {
            //对叶子节点：step1：计算，step2：与当前比较，step3：赋给当前值；step4：返回null（因没有孩子，不需要向下查询）

            //step1

            let { tmpmin, tmpmax } = unifiedCalulate(segmentTrees, currentComputingNodeIndex, func, mode)
            //step2
            if (tmpmax > m4.max) {
                //step3
                m4.max = tmpmax
            }
            m4.currentComputingNodeMax[i] = null
            //step4
            //return []

        } else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以max为例，
            // 大于m4当前的max的，大的给Current，小的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 小于当前的max的，不管了
            // 如果都小于m4当前的max，则该节点fail了，不需要往下，

            let { leftIndex, rightIndex } = getChildrenIndex(currentComputingNodeIndex);

            let { tmpmin: minLeft, tmpmax: maxLeft } = unifiedCalulate(segmentTrees, leftIndex, func, mode)
            let { tmpmin: minRight, tmpmax: maxRight } = unifiedCalulate(segmentTrees, rightIndex, func, mode)
            let ele = Object.create(element)


            //左右孩子都大于m4当前的max的
            if (maxLeft > m4.max && maxRight > m4.max) {
                // 大的给Current，小的进alternative
                if (maxLeft > maxRight) {
                    currentComputingNodeIndex = leftIndex
                    ele.index = rightIndex
                    ele.value = maxRight
                } else {
                    currentComputingNodeIndex = rightIndex
                    ele.index = leftIndex
                    ele.value = maxLeft
                }
                m4.alternativeNodesMax.add(ele)

            }
            // 只有1边大于m4当前的max的
            else if (maxLeft > m4.max || maxRight > m4.max) {
                // 大的给Current，小的不管
                if (maxLeft > maxRight) {
                    currentComputingNodeIndex = leftIndex
                } else {
                    currentComputingNodeIndex = rightIndex
                }
            }
            // 如果都小于m4当前的max，则该节点fail了，不需要往下，
            else {
                currentComputingNodeIndex = null
            }
            m4.currentComputingNodeMax[i] = currentComputingNodeIndex
        }
    }

    // for min=========================================
    for (let i = 0; destination == 'min' && i < m4.currentComputingNodeMin.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMin[i]
        //当前需要计算的节点是叶子结点, 则直接进行计算，并结束，不需要向下查询
        if (isSingleLeaf(segmentTrees[0].nodes[currentComputingNodeIndex])) {
            //对叶子节点：step1：计算，step2：与当前比较，step3：赋给当前值；step4：返回null（因没有孩子，不需要向下查询）

            //step1

            let { tmpmin, tmpmax } = unifiedCalulate(segmentTrees, currentComputingNodeIndex, func, mode)
            //step2
            if (tmpmin < m4.min) {
                //step3
                m4.min = tmpmin
            }
            m4.currentComputingNodeMin[i] = null
            //step4
            //return []

        } else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以min为例，
            // 小于m4当前的min的，小的给Current，大的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 大于当前的max的，不管了
            // 如果都大于m4当前的min，则该节点fail了，不需要往下，

            let { leftIndex, rightIndex } = getChildrenIndex(currentComputingNodeIndex);

            let { tmpmin: minLeft, tmpmax: maxLeft } = unifiedCalulate(segmentTrees, leftIndex, func, mode)
            let { tmpmin: minRight, tmpmax: maxRight } = unifiedCalulate(segmentTrees, rightIndex, func, mode)
            let ele = Object.create(element)


            //左右孩子都小于m4当前的max的
            if (minLeft < m4.min && minRight < m4.min) {
                // 小的给Current，大的进alternative
                if (minLeft < minRight) {
                    currentComputingNodeIndex = leftIndex
                    ele.index = rightIndex
                    ele.value = minRight
                } else {
                    currentComputingNodeIndex = rightIndex
                    ele.index = leftIndex
                    ele.value = minLeft
                }
                m4.alternativeNodesMin.add(ele)

            }
            // 只有1边小于m4当前的min的
            else if (minLeft < m4.min || minRight < m4.min) {
                // 小的给Current，小的不管
                if (minLeft < minRight) {
                    currentComputingNodeIndex = leftIndex
                } else {
                    currentComputingNodeIndex = rightIndex
                }
            }
            // 如果都小于m4当前的min，则该节点fail了，不需要往下，
            else {
                currentComputingNodeIndex = null
            }
            m4.currentComputingNodeMin[i] = currentComputingNodeIndex
        }
    }

    //删除null
    
    if (destination == 'min') {
        //console.log(m4.currentComputingNodeMin)
        m4.currentComputingNodeMin = m4.currentComputingNodeMin.filter(item => item != null);
    } else {
        //console.log(m4.currentComputingNodeMax)
        m4.currentComputingNodeMax = m4.currentComputingNodeMax.filter(item => item != null);
    }


}

//总结：计算的4步：step1:从候选结点取，step2:与m4.max和m4.min比较，step3:赋给Current，step4:取Current孩子
function huisuCompute(m4, segmentTrees, parallel) {
    let needQueryIndex = []
    //for max
    if(!m4.isCompletedMax){
        if(m4.currentComputingNodeMax.length == parallel){
            // 当前currentComputingNodeMax已满并行，外面的CurrentCompute会处理
        }else{
            //currentComputingNodeMax 未满，则需要从alternative中取，取多个，
            //直至: currentComputingNodeMax填满 或 alternativeNodesMax空
            while(m4.currentComputingNodeMax.length < parallel && !m4.alternativeNodesMax.isEmpty()){
                //step1
                let MaxEle = m4.alternativeNodesMax.pop();

                //step2
                if(MaxEle.value>m4.max){
                    //step3
                    m4.currentComputingNodeMax.push(MaxEle.index);
                }else{
                    // 堆顶不如当前m4，那么alternativeNodesMax里其他的都fail了，把alternative 清空
                    m4.alternativeNodesMax = new MaxHeap()  //后续改为清空函数
                }
            }

            if(m4.currentComputingNodeMax.length == 0){
                m4.isCompletedMax = true
            }

            
        }
    }

    if (!m4.isCompletedMax && m4.currentComputingNodeMax.length != 0) {

        for(let i = 0;i<m4.currentComputingNodeMax.length;i++){
            //对叶子结点，不需要取其孩子。
            if (!isLeafNode(segmentTrees[0], m4.currentComputingNodeMax[i])) {
                //step4
                let { leftIndex: leftIndex1, rightIndex: rightIndex1 } = getChildrenIndex(m4.currentComputingNodeMax[i]);
                //查询currentComputingNode的孩子节点，但为了降低select次数，暂时放到一个needQueryIndex里，统一查询。
                needQueryIndex.push(leftIndex1);
                needQueryIndex.push(rightIndex1);
            }
        }
    }

    

    //for Min
    if(!m4.isCompletedMin){
        if(m4.currentComputingNodeMin.length == parallel){
            // 当前currentComputingNodeMin已满并行，外面的CurrentCompute会处理
        }else{
            //currentComputingNodeMin 未满，则需要从alternative中取，取多个，
            //直至: currentComputingNodeMin填满 或 alternativeNodesMin空
            while(m4.currentComputingNodeMin.length < parallel && !m4.alternativeNodesMin.isEmpty()){
                //step1
                let MinEle = m4.alternativeNodesMin.pop();

                //step2
                if(MinEle.value<m4.min){
                    //step3
                    m4.currentComputingNodeMin.push(MinEle.index);
                }else{
                    // 堆顶不如当前m4，那么alternativeNodesMin里其他的都fail了，把alternative 清空
                    m4.alternativeNodesMin = new MinHeap()  //后续改为清空函数
                }
            }

            if(m4.currentComputingNodeMin.length == 0){
                m4.isCompletedMin = true
            }

            
        }
    }

    if (!m4.isCompletedMin && m4.currentComputingNodeMin.length != 0) {

        //对叶子结点，不需要取其孩子。
        for(let i = 0;i<m4.currentComputingNodeMin.length;i++){
            if (!isLeafNode(segmentTrees[0], m4.currentComputingNodeMin[i])) {
                //step4
                let { leftIndex: leftIndex1, rightIndex: rightIndex1 } = getChildrenIndex(m4.currentComputingNodeMin[i]);
                //查询currentComputingNode的孩子节点，但为了降低select次数，暂时放到一个needQueryIndex里，统一查询。
                needQueryIndex.push(leftIndex1);
                needQueryIndex.push(rightIndex1);
            }
        }
    }


    return needQueryIndex



/// 下面的没用了  

    if(!m4.isCompletedMax && !m4.alternativeNodesMax.isEmpty()){
        //step1
        let MaxEle = m4.alternativeNodesMax.pop();

        //step2
        if(MaxEle.value>m4.max){
            //step3
            m4.currentComputingNodeMax = MaxEle.index;

            //对叶子结点，则不需要取其孩子。
            if(isLeafNode(segmentTrees[0],MaxEle.index)){

            }else{
                //step4
                let { leftIndex: leftIndex1, rightIndex: rightIndex1 } = getChildrenIndex(MaxEle.index);
                //查询currentComputingNode的孩子节点，但为了降低select次数，暂时放到一个needQueryIndex里，统一查询。
                needQueryIndex.push(leftIndex1);
                needQueryIndex.push(rightIndex1);
            }

            
        }else{
            m4.isCompletedMax=true
        }

    }else{
        m4.isCompletedMax=true
    }




    //for min
    if(!m4.isCompletedMin && !m4.alternativeNodesMin.isEmpty()){
        //step1
        let MinEle = m4.alternativeNodesMin.pop();

        //step2
        if(MinEle.value<m4.min){
            //step3
            m4.currentComputingNodeMin = MinEle.index;

            //对叶子结点，则不需要取其孩子。
            if(isLeafNode(segmentTrees[0],MinEle.index)){

            }else{
                //step4
                let { leftIndex:leftIndex1, rightIndex:rightIndex1 } = getChildrenIndex(MinEle.index);
                //查询currentComputingNode的孩子节点，但为了降低select次数，暂时放到一个needQueryIndex里，统一查询。
                needQueryIndex.push(leftIndex1);
                needQueryIndex.push(rightIndex1);
            }
        }else{
            m4.isCompletedMin=true
        }

    }else{
        m4.isCompletedMin=true
    }

    return needQueryIndex
    
}

function getInterval(globalStart,globalEnd, time, range){
    let interval = new Interval(0,0)
    interval.eTime = range* Math.ceil((time-globalStart+1)/range) - 1
    interval.sTime = interval.eTime - range + 1 

    if(interval.eTime > globalEnd){
        interval.eTime = globalEnd
    }

    return interval

}





//todo=============================

//构造一个双向链表，节点信息：{ownIndex, preIndex, NextIndex}
// 以字典方式存储，key是ownIndex，value是上面的三元组
//支持操作：addPre(index,pre)，在index前增加，addNext(index, next),在index后增加；
//delete（index）,getPre(index), getNext(index)
// 节点类，表示链表中的每个节点
class Node {
    constructor(ownIndex, preIndex = null, NextIndex = null) {
        this.ownIndex = ownIndex;
        this.preIndex = preIndex;
        this.NextIndex = NextIndex;
    }
}

// 双向链表类，包含节点操作
class DLL {
    constructor() {
        this.nodes = {}; // 存储节点的字典，键为节点的ownIndex
    }

    // 构建双向链表的方法，从传入的索引列表创建链表
    constructFromList(indexList) {

        // 清空现有的链表
        this.nodes = {};

        // 遍历索引列表，构建双向链表
        for (let i = 0; i < indexList.length; i++) {
            const currentIndex = indexList[i];

            // 创建当前节点并添加到字典
            this.nodes[currentIndex] = new Node(currentIndex);

            // 设置前驱和后继
            if (i > 0) {
                // 前一个节点的NextIndex指向当前节点
                this.nodes[indexList[i - 1]].NextIndex = currentIndex;
                // 当前节点的preIndex指向前一个节点
                this.nodes[currentIndex].preIndex = indexList[i - 1];
            }
        }
    }

    parentToChildren(index,leftChild,rightChild){

        this.addPre(index, leftChild)
        this.addNext(index, rightChild)

        // 删除当前节点
        this.delete(index);
    }

    // 删除指定的节点，并在其前后插入新节点
    deleteAndInsert(index, pre, next) {
        const currentNode = this.nodes[index];
        if (!currentNode) {
            console.error("No node exists at index " + index);
            return;
        }

        // 获取要删除节点的前驱和后继节点
        const preNode = this.nodes[currentNode.preIndex];
        const nextNode = this.nodes[currentNode.NextIndex];

        // 删除当前节点
        this.delete(index);

        // 插入新的前驱节点（在原来的前驱和原来的nextNode之间）
        const newPreNode = new Node(pre, currentNode.preIndex, next);
        this.nodes[pre] = newPreNode;
        if (preNode) {
            preNode.NextIndex = pre;
        }
        if (nextNode) {
            nextNode.preIndex = pre;
        }

        // 插入新的后继节点（在新插入的pre和原来的nextNode之间）
        const newNextNode = new Node(next, pre, currentNode.NextIndex);
        this.nodes[next] = newNextNode;
        newPreNode.NextIndex = next;
        if (nextNode) {
            nextNode.preIndex = next;
        }
    }

    // 在给定索引的节点前添加一个新的节点
    addPre(index, pre) {
        if (this.nodes[index]) {
            const currentNode = this.nodes[index];
            const newNode = new Node(pre, currentNode.preIndex, index);

            // 更新现有前驱节点的NextIndex
            if (this.nodes[currentNode.preIndex]) {
                this.nodes[currentNode.preIndex].NextIndex = pre;
            }

            // 更新当前节点的preIndex
            currentNode.preIndex = pre;

            // 将新节点添加到字典
            this.nodes[pre] = newNode;
        } else {
            console.error("No node exists at index " + index);
        }
    }

    // 在给定索引的节点后添加一个新的节点
    addNext(index, next) {
        if (this.nodes[index]) {
            const currentNode = this.nodes[index];
            const newNode = new Node(next, index, currentNode.NextIndex);

            // 更新现有后继节点的preIndex
            if (this.nodes[currentNode.NextIndex]) {
                this.nodes[currentNode.NextIndex].preIndex = next;
            }

            // 更新当前节点的NextIndex
            currentNode.NextIndex = next;

            // 将新节点添加到字典
            this.nodes[next] = newNode;
        } else {
            console.error("No node exists at index " + index);
        }
    }

    // 删除指定索引的节点
    delete(index) {
        const currentNode = this.nodes[index];
        if (!currentNode) {
            console.error("No node exists at index " + index);
            return;
        }

        // 更新前驱和后继节点的连接
        if (this.nodes[currentNode.preIndex]) {
            this.nodes[currentNode.preIndex].NextIndex = currentNode.NextIndex;
        }
        if (this.nodes[currentNode.NextIndex]) {
            this.nodes[currentNode.NextIndex].preIndex = currentNode.preIndex;
        }

        // 从字典中删除当前节点
        delete this.nodes[index];
    }

    // 获取给定索引的前驱节点
    getPre(index) {
        if (this.nodes[index]) {
            return this.nodes[this.nodes[index].preIndex] || null;
        } else {
            return null;
        }
    }

    // 获取给定索引的后继节点
    getNext(index) {
        if (this.nodes[index]) {
            return this.nodes[this.nodes[index].NextIndex] || null;
        } else {
            return null;
        }
    }
}

function getFrontMidLast(globalStartTime, globalEndTime, sTime, eTime, intervalRange){
    let s, m, e;
    let f = null;
    let s_mod = (sTime - globalStartTime) % intervalRange;
    let e_mod = (eTime - globalStartTime) % intervalRange;

    if(s_mod == 0){
        s = null;
    } else{
        s = sTime - s_mod + intervalRange - 1;
        if(s > eTime){
            s = null;
        }
    }
    
    if((e_mod + 1) % intervalRange == 0){
        e = null;
    } else{
        e = eTime - e_mod;
        if(e < sTime){
            e = null;
        }
    }

    if(s == null){
        m = sTime + intervalRange - 1;
        if(m > eTime){
            m = null;
        }
    } else{
        let next_s = s + intervalRange;
        if(next_s > eTime){
            m = null;
        } else{
            m = next_s;
        }
    }
    
    if(s == null && m == null && e == null){
        f = eTime - e_mod;
    }

    return {
        s: s,
        m: m,
        e: e,
        f: f
    }
}


function getNodesIndexFront(frontTime, intervalRange, index, dll, segmentTree){
    let nodeIndex = [];
    let timeFrontLimit = frontTime - intervalRange ;
    let current = dll.getPre(index);
    if(current == null){
        return nodeIndex;
    }
    while(segmentTree.nodes[current.ownIndex].eTime > timeFrontLimit){
        nodeIndex.push(current.ownIndex);
        current = dll.getPre(current.ownIndex);
        if(current == null){
            break
        }
    }
    return nodeIndex;
}



function getNodesIndexLast(lastTime, intervalRange, index, dll, segmentTree){
    let nodeIndex = [];
    let timeLastLimit = lastTime + intervalRange;

    let current = dll.getNext(index);
    if(current == null){
        return nodeIndex;
    }
    while(segmentTree.nodes[current.ownIndex].sTime < timeLastLimit){
        nodeIndex.push(current.ownIndex);
        current = dll.getNext(current.ownIndex);
        if(current == null){
            break
        }
    }
    
    return nodeIndex;
}

function getContainNum(node, startTime, endTime){
    let s = Math.max(node.sTime, startTime);
    let e = Math.min(node.eTime, endTime);
    let num = e - s + 1;
    return num;
}


function getIntervalFromNode(globalStartTime, globalEndTime, sTime, eTime, intervalRange) {
    // 计算 sTime 和 eTime 的起始和结束区间的索引
    let startIntervalIndex = Math.floor((sTime - globalStartTime) / intervalRange);
    const endIntervalIndex = Math.floor((eTime - globalStartTime) / intervalRange);

    // 如果 sTime 刚好是区间的起点，减去 1 以包含前一个区间
    if ((sTime - globalStartTime) % intervalRange === 0) {
        startIntervalIndex -= 1;
    }

    // 初始化一个数组用于存储符合条件的 Interval 对象
    const intervals = [];

    // 遍历从 startIntervalIndex 到 endIntervalIndex 的区间
    for (let i = startIntervalIndex; i <= endIntervalIndex; i++) {
        const intervalStart = globalStartTime + i * intervalRange;
        const intervalEnd = Math.min(intervalStart + intervalRange - 1, globalEndTime); // 确保不超过 globalEndTime

        // 检查当前区间与 [sTime, eTime] 是否有重叠
        if (intervalEnd >= sTime && intervalStart <= eTime) {
            intervals.push(new Interval(intervalStart, intervalEnd));
        }
    }

    return intervals;
}

function getLeaves(segmentTree, sTime, eTime) {
    const rootNode = segmentTree.root;
    const startTime = rootNode.sTime;
    const endTime = rootNode.eTime;

    // 计算叶子节点数目
    const leafCount = endTime - startTime + 1;

    // 计算叶子节点的索引起始位置和索引范围
    const leafIndexStart = endTime - startTime;
    const leafIndexEnd = leafIndexStart + leafCount;

    // 计算符合 [sTime, eTime] 的叶节点索引范围
    const startIndex = leafIndexStart + (sTime - startTime);
    const endIndex = leafIndexStart + (eTime - startTime);

    // 输出符合条件的索引
    const indices = [];
    for (let i = startIndex; i <= endIndex; i++) {
        indices.push(i);
    }

    return indices;
}

function getUnQueryIndex(segmentTree, indexset){

    let indexArray2 = []
    for(let i=0;i<indexset.length;i++){
        if(segmentTree.nodes[indexset[i]] == null){
            indexArray2.push(indexset[i])
        }
    }

    return indexArray2

}

function computeIntervalAVG(segmentTree, leaves){
    let sum = 0
    for(let i=0;i<leaves.length;i++){
        sum += segmentTree.nodes[leaves[i]].max
    }

    return sum/leaves.length
}

// 计算M4 的s、e时间的interval 的avg
function ComputeSTAVG(segmentTrees, m4){

    let interval,tt

   


        m4.st_v = computeIntervalAVG(segmentTrees[0],  m4.stInterval.nodes)


        m4.et_v = computeIntervalAVG(segmentTrees[0], m4.etInterval.nodes)


}
//=====================

function calculateForAVG(segmentTree,nodeList,intervalStartTime,intervalEndTime, destination){


    let total = 0
    for(let i=0;i<nodeList.length;i++){
        let node = segmentTree.nodes[nodeList[i]]
        let containNum = getContainNum(node, intervalStartTime, intervalEndTime)
        
        if(destination == 'min'){
            if(containNum == node.eTime-node.sTime+1){
                //表示该node完全在interval中,则n-1个取min，1个取max
                total+= (node.eTime-node.sTime)*node.min + node.max
            }else{
                total+= containNum*node.min
            }
        }else{
            if(containNum == node.eTime-node.sTime+1){
                total+= (node.eTime-node.sTime)*node.max + node.min
            }else{
                total+= containNum*node.max
            }
        }


    }

    return total/(intervalEndTime-intervalStartTime+1)
}


function calculateFrontAVG(frontTime, node, dll, segmentTree, intervalRange, destination){

    let nodeList = getNodesIndexFront(frontTime, intervalRange, node.index, dll, segmentTree)
    //nodeList.push(node.index)

    let total = 0
    for(let i=0;i<nodeList.length;i++){
        let node = segmentTree.nodes[nodeList[i]]
        let containNum = getContainNum(node, frontTime-intervalRange+1, frontTime)
        
        if(destination == 'min'){
            if(containNum == node.eTime-node.sTime+1){
                //表示该node完全在interval中,则n-1个取min，1个取max
                total+= (node.eTime-node.sTime)*node.min + node.max
            }else{
                /////!!!!!!bug
                total+= (node.eTime-node.sTime+1)*node.min
            }
        }else{
            if(containNum == node.eTime-node.sTime+1){
                total+= (node.eTime-node.sTime)*node.max + node.min
            }else{
                /////!!!!!!bug
                total+= (node.eTime-node.sTime+1)*node.max
            }
        }


    }

    return total/intervalRange

}


//!!!!!!bug,同front
function calculateLastAVG(lastTime, node, dll, segmentTree, intervalRange, destination){
    let nodeList = getNodesIndexLast(lastTime, intervalRange, node.index, dll, segmentTree)
    //nodeList.push(node.index)

    let total = 0
    for(let i=0;i<nodeList.length;i++){
        let node = segmentTree.nodes[nodeList[i]]
        let containNum = getContainNum(node, lastTime,lastTime+intervalRange-1)
        
        if(destination == 'min'){
            if(containNum == node.eTime-node.sTime+1){
                //表示该node完全在interval中,则n-1个取min，1个取max
                total+= (node.eTime-node.sTime)*node.min + node.max
            }else{
                total+= (node.eTime-node.sTime+1)*node.min
            }
        }else{
            if(containNum == node.eTime-node.sTime+1){
                total+= (node.eTime-node.sTime)*node.max + node.min
            }else{
                total+= (node.eTime-node.sTime+1)*node.max
            }
        }


    }

    return total/intervalRange
}


//比较复杂，需要对每个node，计算三种interval，1、完全包含的，2、包含后半段，前半段在前几个node，3、包含前半段，后半段在前几个node
//注意！！！！！要检查一下，计算的mid、front、拉上他是否在M4中，如果不在，则不需要计算。
function AVGCalulateUnLeaf( segmentTrees, index, func, m4){
    let node = segmentTrees[0].nodes[index]
    let intervalRange = func.extremes[0]
    let frontValue, midVlaue, lastValue, fullVlaue
    let nodeListFront = [], nodeListLast = [], calculateList = []
    // if(node.eTime-node.sTime <intervalRange){
    //     return null
    // }

      
    let {s:front, m:mid, e:last, f:full} = getFrontMidLast(segmentTrees[0].nodes[0].sTime, segmentTrees[0].nodes[0].eTime,
        node.sTime, node.eTime,intervalRange)
    
        if(full != null){
            //说明node 完全包含在一个区间内
            nodeListFront = getNodesIndexFront(full+intervalRange-1,intervalRange,index,m4.minDLL,segmentTrees[0])
            nodeListLast = getNodesIndexLast(full, intervalRange,index,m4.minDLL,segmentTrees[0])
            calculateList = []
            calculateList.push(...nodeListFront)
            calculateList.push(index)
            calculateList.push(...nodeListLast)
            let tmpMin = calculateForAVG(segmentTrees[0],calculateList, full,full+intervalRange-1, 'min')
    
    
            nodeListFront = getNodesIndexFront(full+intervalRange-1,intervalRange,index,m4.maxDLL,segmentTrees[0])
            nodeListLast = getNodesIndexLast(full, intervalRange,index,m4.maxDLL,segmentTrees[0])
            calculateList = []
            calculateList.push(...nodeListFront)
            calculateList.push(index)
            calculateList.push(...nodeListLast)
            let tmpMax = calculateForAVG(segmentTrees[0],calculateList, full,full+intervalRange-1, 'max')
    
            return {
                tmpmin: tmpMin,
                tmpmax: tmpMax
            }
        }


    // for min =========== 

    if(front!= null){
        calculateList =  getNodesIndexFront(front, intervalRange, index, m4.minDLL, segmentTrees[0])
        calculateList.push(index)
        frontValue = calculateForAVG(segmentTrees[0],calculateList, front-intervalRange+1, front, 'min')

    }else{
        frontValue = Infinity
    }

    if(mid != null){
        midVlaue = node.min
    }else{
        midVlaue = Infinity
    }

    if(last!= null){
        calculateList = getNodesIndexLast(last, intervalRange, index, m4.minDLL, segmentTrees[0])
        calculateList.push(index)
        lastValue = calculateForAVG(segmentTrees[0],calculateList, last, last+intervalRange-1, 'min')
    }else{
        lastValue = Infinity
    }

    let tmpMin = Math.min(frontValue,midVlaue, lastValue)

// for max ===========    
    if (front != null) {
        calculateList = getNodesIndexFront(front, intervalRange, index, m4.maxDLL, segmentTrees[0])
        calculateList.push(index)
        frontValue = calculateForAVG(segmentTrees[0], calculateList, front - intervalRange + 1, front, 'max')

    } else {
        frontValue = -Infinity
    }

    if (mid != null) {
        midVlaue = node.max
    } else {
        midVlaue = -Infinity
    }

    if (last != null) {
        calculateList = getNodesIndexLast(last, intervalRange, index, m4.maxDLL, segmentTrees[0])
        calculateList.push(index)
        lastValue = calculateForAVG(segmentTrees[0], calculateList, last, last+intervalRange-1, front, 'max')
    } else {
        lastValue = -Infinity
    }

    let tmpMax = Math.max(frontValue, midVlaue, lastValue)

    return {
        tmpmin: tmpMin,
        tmpmax: tmpMax
    }

}

//对不需要分裂的“叶子”节点进行均值计算
//该node长度已经小于一个interval，因此只用两种情况：1、该node完全包含在一个interval中，2、该node包含两个interval的前半段和后半段
//注意！！！！！要检查一下，计算的interval是否在M4中，如果不在，则不需要计算。
function AVGCalulateLeaf(segmentTree, index,func, m4){

    let node = segmentTree.nodes[index]
    let intervalRange = func.extremes[0]
    let leafIndex = []
    let sum = 0
    let max = -Infinity
    let min = Infinity
    let leaves = []

    let intervals = getIntervalFromNode(segmentTree.nodes[0].sTime, segmentTree.nodes[0].eTime, 
        node.sTime, node.eTime,intervalRange)

    for(let i=0;i<intervals.length;i++){
        let sTime = intervals[i].sTime
        let eTime = intervals[i].eTime

        // if( ContainForAVG(sTime, eTime, m4) != 3){
        //     continue
        // }

        let tt = getLeaves(segmentTree,sTime,eTime)
        leaves[i] = tt
        leafIndex.push(...tt)
    }

    let unQueryIndex = getUnQueryIndex(segmentTree, leafIndex)

    if(unQueryIndex.length == 0){
        for(let i=0;i<intervals.length;i++){
            //!!!!! bug????

            sum = 0
            for(let j=0;j<leaves[i].length;j++){
                let leaf = segmentTree.nodes[leaves[i][j]]
                sum += leaf.min
            }

            if(sum/intervalRange > max){
                max = sum/intervalRange
            }
            if(min > sum/intervalRange){
                min = sum/intervalRange
            }
        }
        
    }

    return {
        tmpIndex:unQueryIndex, 
        tmpMin:min, 
        tmpMax:max
    } 
}

function LessOrMore(node, length){
    //该node的宽度，小于interval的宽度
    if(node.eTime - node.sTime +1 < length){
        return 1
    }

    if(node.eTime - node.sTime +1 == length){
        return 2
    }

    if(node.eTime - node.sTime +1 > length){
        return 3
    }
}

function isLessThanInterval(node, m4){
    //let node = tree.nodes[index]
    
    //该node的宽度，小于interval的宽度
    if(node.eTime - node.sTime > m4.stInterval.eTime - m4.stInterval.sTime){
        return false
    }else{
        return true
    }

}

function huisuComputeAVG(m4, segmentTrees,func, parallel) {
    let needQueryIndex = []
    //for max
    if(!m4.isCompletedMax){
        if(m4.currentComputingNodeMax.length == parallel){
            // 当前currentComputingNodeMax已满并行，外面的CurrentCompute会处理
        }else{
            //currentComputingNodeMax 未满，则需要从alternative中取，取多个，
            //直至: currentComputingNodeMax填满 或 alternativeNodesMax空
            while(m4.currentComputingNodeMax.length < parallel && !m4.alternativeNodesMax.isEmpty()){
                //step1
                let MaxEle = m4.alternativeNodesMax.pop();

                //step2
                if(MaxEle.value>m4.max){
                    //step3
                    m4.currentComputingNodeMax.push(MaxEle.index);
                }else{
                    // 堆顶不如当前m4，那么alternativeNodesMax里其他的都fail了，把alternative 清空
                    m4.alternativeNodesMax = new MaxHeap()  //后续改为清空函数
                }
            }

            if(m4.currentComputingNodeMax.length == 0){
                m4.isCompletedMax = true
            }

            
        }
    }

    if (!m4.isCompletedMax && m4.currentComputingNodeMax.length != 0) {

        for(let i = 0;i<m4.currentComputingNodeMax.length;i++){
            //对长度小于等于interval的结点，不需要取其孩子，外面的Current会计算。
            if (LessOrMore(segmentTrees[0].nodes[m4.currentComputingNodeMax[i]] , func.intervalRange) >2) {
                //step4
                let { leftIndex: leftIndex1, rightIndex: rightIndex1 } = getChildrenIndex(m4.currentComputingNodeMax[i]);
                //查询currentComputingNode的孩子节点，但为了降低select次数，暂时放到一个needQueryIndex里，统一查询。
                needQueryIndex.push(leftIndex1);
                needQueryIndex.push(rightIndex1);
            }
        }
    }

    

    //for Min
    if(!m4.isCompletedMin){
        if(m4.currentComputingNodeMin.length == parallel){
            // 当前currentComputingNodeMin已满并行，外面的CurrentCompute会处理
        }else{
            //currentComputingNodeMin 未满，则需要从alternative中取，取多个，
            //直至: currentComputingNodeMin填满 或 alternativeNodesMin空
            while(m4.currentComputingNodeMin.length < parallel && !m4.alternativeNodesMin.isEmpty()){
                //step1
                let MinEle = m4.alternativeNodesMin.pop();

                //step2
                if(MinEle.value<m4.min){
                    //step3
                    m4.currentComputingNodeMin.push(MinEle.index);
                }else{
                    // 堆顶不如当前m4，那么alternativeNodesMin里其他的都fail了，把alternative 清空
                    m4.alternativeNodesMin = new MinHeap()  //后续改为清空函数
                }
            }

            if(m4.currentComputingNodeMin.length == 0){
                m4.isCompletedMin = true
            }

            
        }
    }

    if (!m4.isCompletedMin && m4.currentComputingNodeMin.length != 0) {

        //对叶子结点，不需要取其孩子。
        for(let i = 0;i<m4.currentComputingNodeMin.length;i++){
            if (LessOrMore(segmentTrees[0].nodes[m4.currentComputingNodeMin[i]], func.intervalRange)>2) {
                //step4
                let { leftIndex: leftIndex1, rightIndex: rightIndex1 } = getChildrenIndex(m4.currentComputingNodeMin[i]);
                //查询currentComputingNode的孩子节点，但为了降低select次数，暂时放到一个needQueryIndex里，统一查询。
                needQueryIndex.push(leftIndex1);
                needQueryIndex.push(rightIndex1);
            }
        }
    }


    return needQueryIndex


    
}

function ContainForAVG(sTime, eTime, m4){
    // if(index == null){
    //     return -1
    // }
    
    if(eTime <= m4.stInterval.eTime){
        //该node的右边界没有越过M4_array[i].stInterval
        return 1
    }

    if(sTime >= m4.etInterval.sTime){
        //该node的左边界没有越过M4_array[i].etInterval
        return 2
    }

    if(eTime > m4.stInterval.eTime 
        && sTime < m4.etInterval.sTime)
    {
        return 3
    }



}

function CurrentComputeAVG(m4, segmentTrees,func, destination, mode){
    let needQueryIndex = []

    // for Max=========================================
    for (let i = 0; destination == 'max' && i < m4.currentComputingNodeMax.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMax[i]
        let node = segmentTrees[0].nodes[currentComputingNodeIndex]


        // 类似叶子结点的判断，这里的非“叶子”，该节点长度小于区间，则分裂到底，并进行exact 计算
        if (LessOrMore(segmentTrees[0].nodes[ currentComputingNodeIndex], func.intervalRange) < 3) {

            //step1
            let {tmpIndex, tmpMin, tmpMax} = AVGCalulateLeaf(segmentTrees[0], currentComputingNodeIndex,func, m4)
            if(tmpIndex.length != 0){
                // 需要查询，则本轮只进行查询，下一轮再计算
                needQueryIndex.push(...tmpIndex)
                
                continue
            }
            //表示不需要查询，即上一轮已经进行了查询，本轮只需进行计算
            //step2
            if (tmpMax > m4.max) {
                //step3
                m4.max = tmpMax
            }
            m4.currentComputingNodeMax[i] = null
        } else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以max为例，
            // 大于m4当前的max的，大的给Current，小的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 小于当前的max的，不管了
            // 如果都小于m4当前的max，则该节点fail了，不需要往下，

            let { leftIndex, rightIndex } = getChildrenIndex(currentComputingNodeIndex);
            m4.maxDLL.parentToChildren(currentComputingNodeIndex,leftIndex,rightIndex)

            let { tmpmin: minLeft, tmpmax: maxLeft } = AVGCalulateUnLeaf(segmentTrees, leftIndex, func, m4)
            let { tmpmin: minRight, tmpmax: maxRight } = AVGCalulateUnLeaf(segmentTrees, rightIndex, func, m4)
            let ele = Object.create(element)


            //左右孩子都大于m4当前的max的
            if (maxLeft > m4.max && maxRight > m4.max) {
                // 大的给Current，小的进alternative
                if (maxLeft > maxRight) {
                    currentComputingNodeIndex = leftIndex
                    ele.index = rightIndex
                    ele.value = maxRight
                } else {
                    currentComputingNodeIndex = rightIndex
                    ele.index = leftIndex
                    ele.value = maxLeft
                }

                //分裂后的这个孩子在m4区间，才近alternative
                //if(ContainForAVG(segmentTrees[0][ele.index].sTime, segmentTrees[0][ele.index].eTime, m4) == 3){
                    m4.alternativeNodesMax.add(ele)
                //}

            }
            // 只有1边大于m4当前的max的
            else if (maxLeft > m4.max || maxRight > m4.max) {
                // 大的给Current，小的不管
                if (maxLeft > maxRight) {
                    currentComputingNodeIndex = leftIndex
                } else {
                    currentComputingNodeIndex = rightIndex
                }
            }
            // 如果都小于m4当前的max，则该节点fail了，不需要往下，
            else {
                currentComputingNodeIndex = null
            }

            m4.currentComputingNodeMax[i] = currentComputingNodeIndex
           
        }

    }


    // for Min=========================================
    for (let i = 0; destination == 'min' && i < m4.currentComputingNodeMin.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMin[i]
        let node = segmentTrees[0].nodes[currentComputingNodeIndex]


        // 类似叶子结点的判断，这里的非“叶子”，该节点长度小于区间，则分裂到底，并进行exact 计算
        if (LessOrMore(segmentTrees[0].nodes[ currentComputingNodeIndex], func.intervalRange) < 3) {

            //step1
            let {tmpIndex, tmpMin, tmpMax} = AVGCalulateLeaf(segmentTrees[0], currentComputingNodeIndex, func, m4)
            if(tmpIndex.length != 0){
                // 需要查询，则本轮只进行查询，下一轮再计算
                needQueryIndex.push(...tmpIndex)
                
                continue
            }
            //表示不需要查询，即上一轮已经进行了查询，本轮只需进行计算
            //step2
            if (tmpMin < m4.min) {
                //step3
                m4.min = tmpMin
            }
            m4.currentComputingNodeMin[i] = null
        } else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以Min为例，
            // 大于m4当前的Min的，大的给Current，小的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 小于当前的Min的，不管了
            // 如果都小于m4当前的Min，则该节点fail了，不需要往下，

            let { leftIndex, rightIndex } = getChildrenIndex(currentComputingNodeIndex);

            m4.minDLL.parentToChildren(currentComputingNodeIndex, leftIndex, rightIndex)

            let { tmpmin: minLeft, tmpmax: maxLeft } = AVGCalulateUnLeaf(segmentTrees, leftIndex, func, m4)
            let { tmpmin: minRight, tmpmax: maxRight } = AVGCalulateUnLeaf(segmentTrees, rightIndex, func, m4)
            let ele = Object.create(element)


            //左右孩子都大于m4当前的Min的
            if (minLeft < m4.min && minRight < m4.min) {
                // 大的给Current，小的进alternative
                if (minLeft < minRight) {
                    currentComputingNodeIndex = leftIndex
                    ele.index = rightIndex
                    ele.value = minRight
                } else {
                    currentComputingNodeIndex = rightIndex
                    ele.index = leftIndex
                    ele.value = minLeft
                }

                //分裂后的这个孩子在m4区间，才近alternative
                //if(ContainForAVG(segmentTrees[0][ele.index].sTime, segmentTrees[0][ele.index].eTime, m4) == 3){
                    m4.alternativeNodesMin.add(ele)
               // }

            }
            // 只有1边大于m4当前的min的
            else if (minLeft < m4.min || minRight < m4.min) {
                // 大的给Current，小的不管
                if (minLeft < minRight) {
                    currentComputingNodeIndex = leftIndex
                } else {
                    currentComputingNodeIndex = rightIndex
                }
            }
            // 如果都小于m4当前的min，则该节点fail了，不需要往下，
            else {
                currentComputingNodeIndex = null
            }

            m4.currentComputingNodeMin[i] = currentComputingNodeIndex

        }

    }

    //删除null

    if (destination == 'min') {
        //console.log(m4.currentComputingNodeMin)
        m4.currentComputingNodeMin = m4.currentComputingNodeMin.filter(item => item != null);
    } else {
        //console.log(m4.currentComputingNodeMax)
        m4.currentComputingNodeMax = m4.currentComputingNodeMax.filter(item => item != null);
    }
    
    return needQueryIndex
}

async function initM4AVG(segmentTrees,M4_array,func, mode, parallel, width,height,errorBound) {
    let needQueryIndex = []
    let leaves = []
    let tmpNeed = []
    


    for(let i=0;i<M4_array.length;i++){
        


        //init m4
        M4_array[i].alternativeNodesMax=new MaxHeap()
        M4_array[i].alternativeNodesMin=new MinHeap()
        M4_array[i].isCompletedMax=false
        M4_array[i].isCompletedMin=false
        M4_array[i].currentComputingNodeMax = []
        M4_array[i].currentComputingNodeMin = []

        //计算边界node
        // 计算M4 的s、e时间的interval 的avg
        //注意！！！！移到外面做
        //ComputeSTAVG(segmentTrees, M4_array, func, width, mode, symble, parallel)

        // 计算M4 的s、e时间的interval 的avg
        
        ComputeSTAVG(segmentTrees, M4_array[i])

        

            if( M4_array[i].st_v < M4_array[i].et_v){
                M4_array[i].min = M4_array[i].st_v
                M4_array[i].max = M4_array[i].et_v

            }else{
                M4_array[i].min = M4_array[i].et_v
                M4_array[i].max = M4_array[i].st_v
            }


        if(M4_array[i].innerNodes.length == 0){
            M4_array[i].isCompletedMax=true
            M4_array[i].isCompletedMin=true

            continue

        }


        //注意！！！initddl放在构建树结束，ddl作为树的一个成员变量
        //initDDL(M4_array[i])
        //!!!！！！！！!!这个排序方式是不对的，不应该按照index大小排序，而是按照index对应的node的时间去排
        //M4_array[i].innerNodes.sort(function(a, b){return a - b});
        M4_array[i].minDLL = new DLL()
        M4_array[i].maxDLL = new DLL()
        M4_array[i].minDLL.constructFromList(M4_array[i].innerNodes)
        M4_array[i].maxDLL.constructFromList(M4_array[i].innerNodes)


        
        

        //计算inner node
        //将m4.innerNodes全部放入候选队列
        //这里，默认 interval较小，最初的分裂，是不会达到小于interval的“叶子”
        for(let j=0;j<M4_array[i].innerNodes.length;j++){
            let index = M4_array[i].innerNodes[j]


            if(i == 1){
                let debug = 1
            }

            let {tmpmin,tmpmax}=AVGCalulateUnLeaf(segmentTrees, index, func, M4_array[i])


            let max_e = Object.create(element)
            max_e.value=tmpmax
            max_e.index=index
            M4_array[i].alternativeNodesMax.add(max_e)

            let min_e = Object.create(element)
            min_e.value=tmpmin
            min_e.index=index
            M4_array[i].alternativeNodesMin.add(min_e)
        }


       
        
        // //计算的4步：从候选结点取，与m4.max和m4.min比较，赋给Current，获取、查询Current孩子
        // let tt = huisuComputeAVG(M4_array[i], segmentTrees, func, parallel);
        // needQueryIndex.push(...tt)


    }


    if(errorBoundSatisfy(M4_array, width,height,errorBound)){
        //break
    }

    for(let i=0;i<M4_array.length;i++){
        //计算的4步：从候选结点取，与m4.max和m4.min比较，赋给Current，获取、查询Current孩子
        let tt = huisuComputeAVG(M4_array[i], segmentTrees, func, parallel);
        needQueryIndex.push(...tt)
    }

    

    //上面计算，将要计算的节点currentComputingNodeMax的孩子存储在needQueryIndex中，从数据库查询并计算
    await Multi_Query(needQueryIndex,leaves, segmentTrees)
    
    
}


async function Start_AVG_Compute(segmentTrees,M4_array,width,height,func, mode, parallel,errorBound){
    

    console.time('initM4AVG');
    await initM4AVG(segmentTrees,M4_array,func, mode, parallel, width,height,errorBound)
    console.timeEnd('initM4AVG');




    //经过上面的处理，以及Multi_Query后，每个像素列m4里，当前要计算的节点currentComputingNodeMax，及其孩子已经查询计算得到。
    //下面开始根据currentComputingNodeMax对左右孩子进行计算

    let needQueryIndex = []
    let leaves = []
    let computedCount = 0
    while(computedCount < M4_array.length*2 ){
        //console.log(computedCount)
        computedCount = 0
        
        for(let i=0;i<M4_array.length;i++){

            if(i == 571){
                let debug = 1
                //console.log(M4_array[i])
            }

            //先计算min
            if(M4_array[i].isCompletedMin){
                computedCount++
                //console.log(computedCount)
            }
            else{
                //对M4_array[i]的Current进行计算
                tmpNeed = CurrentComputeAVG(M4_array[i], segmentTrees,func, 'min', mode)
                leaves.push(...tmpNeed)
            }
            
            //计算max
            if(M4_array[i].isCompletedMax){
                computedCount++
                //console.log(computedCount)
            }else{
                //对M4_array[i]的Current进行计算
                tmpNeed = CurrentComputeAVG(M4_array[i], segmentTrees,func, 'max', mode)
                leaves.push(...tmpNeed)
            }

            // let tt = huisuComputeAVG(M4_array[i], segmentTrees,func, parallel);
            // needQueryIndex.push(...tt)

        }

        if(errorBoundSatisfy(M4_array, width,height,errorBound)){
            break
        }


        for(let i=0;i<M4_array.length;i++){
            let tt = huisuComputeAVG(M4_array[i], segmentTrees,func, parallel);
            needQueryIndex.push(...tt)
        }

        //经过上面的for循环，相当于对m4像素列遍历了一遍，也就是对每个m4的 当前计算节点进行了计算，并把其左右孩子放入候选堆，
        //然后通过huisu，取出候选堆中的最优节点，并找到其孩子的index放入needQuery中
        await Multi_Query(needQueryIndex, leaves, segmentTrees)
        needQueryIndex = []
        leaves = []
    }



    
    

}


function isContainAVG(node, m4){
    if(m4 == null){
        return {
            typeS: null,
            typeE: null
       }
    }
    
    let typeS = 0;
    let typeE = 0;

    //for m4.stInterval, m4 sTime 所在的interval
    switch(true){ 
        //Node在m4.stInterval左边；
        case node.eTime < m4.stInterval.sTime:
            typeS = 1;break;

        //Node一部分在m4.stInterval内部，但不完全在:该node左边从Interval伸出，右边包含在Interval内；
        case node.sTime < m4.stInterval.sTime &&  node.eTime >= m4.stInterval.sTime &&  node.eTime <= m4.stInterval.eTime:
            typeS = 2;break;

        //Node完全在m4.stInterval内部；
        case node.sTime >= m4.stInterval.sTime && node.eTime <= m4.stInterval.eTime:
            typeS = 3;break;

        //Node一部分在m4.stInterval内部，但不完全在:该node右边从Interval伸出，左边包含在Interval内；
        case node.sTime >= m4.stInterval.sTime && node.sTime <= m4.stInterval.eTime && node.eTime > m4.stInterval.eTime:
            typeS = 4;break;
          
        //Node完全包住m4.stInterval，且左右两边伸出；
        case node.sTime < m4.stInterval.sTime && node.eTime > m4.stInterval.eTime:
            typeS = 5;break;

        //Node在m4.stInterval右边；
        case node.sTime > m4.stInterval.eTime:
            typeS = 6;break;



        default:
            typeS = 0;break;
    }


    //for m4.eInterval, m4 eTime 所在的interval
    switch(true){ 
        //Node在m4.etInterval左边；
        case node.eTime < m4.etInterval.sTime:
            typeE = 1;break;

        //Node一部分在m4.etInterval内部，但不完全在；
        case node.sTime < m4.etInterval.sTime &&  node.eTime >= m4.etInterval.sTime &&  node.eTime <= m4.etInterval.eTime: 
            typeE = 2;break;

        //Node完全在m4.etInterval内部；
        case node.sTime >= m4.etInterval.sTime && node.eTime <= m4.etInterval.eTime:
            typeE = 3;break;

        //Node一部分在m4.etInterval内部，但不完全在；
        case node.sTime >= m4.etInterval.sTime && node.sTime <= m4.etInterval.eTime && node.eTime > m4.etInterval.eTime:
            typeE = 4;break;
        
        //Node完全包住m4.etInterval，且左右两边伸出；
        case node.sTime < m4.etInterval.sTime && node.eTime > m4.etInterval.eTime:
            typeE = 5;break;
        
        //Node在m4.etInterval右边；
        case node.sTime > m4.etInterval.eTime:
            typeE = 6;break;
    
    
        
        default:
            typeE = 0;break;
    }

    return {
         typeS: typeS,
         typeE: typeE
    }

}

//对node节点延m4边界向下查询，直至查询到底层，并把查询到的树节点的Index返回。
//并将分裂的节点，加入到对应的M4中,同时要计算分裂后的每个node对应的时间范围，因为需要根据时间范围，不断分裂到底层
//对node节点延m4边界向下查询，直至查询到底层，并把查询到的树节点的Index返回。
//并将分裂的节点，加入到对应的M4中,同时要计算分裂后的每个node对应的时间范围，因为需要根据时间范围，不断分裂到底层

//整体上，devisionNodeIndex的左右就是，对node不断分裂，填充每个M4的 stnode、innernode、etnode
function devisionNodeIndex(type, segmentTree1, node, M4_array, i, func){


    type = isContain(node, M4_array[i])
    //对叶子结点
    if(isSingleLeaf(node)){
        //叶子Node与M4左边界重合，该节点的值（因为是叶子节点，所以min=max）赋给该M4的左边界st_v
        if(type == -2){
            M4_array[i].stNodeIndex=node.index   
            return []
        }

        //叶子Node在M4内部，放到该M4的inner中
        if(type == -3){
            M4_array[i].innerNodes.push(node.index)
            return []
        }

        //叶子Node与M4右边界重合，该节点的值（因为是叶子节点，所以min=max）赋给该M4的右边界et_v
        if(type == -4){
            M4_array[i].etNodeIndex=node.index  
            return []
        }
        return []
    }


    //对非叶子结点，大致分如下几类：
    //type=1、node完全在（i)M4左边，不需要考虑，是前一个M4的事；
    //type = 2\3,属于一部分在前一个M4，一部分在(i)M4，这种情况也不管，前一个M4已经进行了处理，相当于前一个的7/8
    //type = 5,完全在（i)M4内部，不分裂，直接进inner
    // type = 4 6 ,全部都部分都在(i)M4，则分裂，递归，
    // type = 7 8,一部分在(i)M4,一部分在下一个，(i+1)M4，则分裂后，两个孩子分别给自己和下一个M4递归
    // type = 9,全部分在下一个，(i+1)M4，则分给下一个M4

    
    if(type == 1 || type == 2 || type == 3){
        return []
    }


    if(type == 9){
        // type = 9,全部分在下一个，(i+1)M4，则分给下一个M4
        //貌似也不用管？？？

        return []
        if(i+1 < M4_array.length){
            return []
            return devisionNodeIndex(type, segmentTree1, node, M4_array, i+1, func)
        }
    }
    
    // 对非叶子节点，如果该node完全包含在M4内部，则不需要分裂，而是仅仅将该node加入到M4的innerNodes中即可。
    if(type == 5){
        //注意一下，对这种innerNodes的处理，在division外部已经处理了，看一下是否会处理重复。
        M4_array[i].innerNodes.push(node.index)
        return []
    }

    
    // 对非叶子节点，分裂其左右孩子
    let { leftIndex, rightIndex } = getChildrenIndex(node.index);
    if(func.funName == 'avg_w'){
        segmentTree1.minDLL.parentToChildren(node.index,leftIndex, rightIndex)
        segmentTree1.maxDLL.parentToChildren(node.index,leftIndex, rightIndex)
    }

    let leftChild = new SegmentTreeNode()
    let { sTime:sTime1, eTime:eTime1 } = getSETimeByIndex(segmentTree1, leftIndex);
    leftChild.sTime = sTime1
    leftChild.eTime = eTime1
    leftChild.index = leftIndex

    let rightChild = new SegmentTreeNode()
    let { sTime:sTime2, eTime:eTime2 } = getSETimeByIndex(segmentTree1, rightIndex);
    rightChild.sTime = sTime2
    rightChild.eTime = eTime2
    rightChild.index = rightIndex

    //保存向下分裂后需要查询的index,先把当前分裂的左右孩子放进去
    let needQuerysIndex = []
    needQuerysIndex.push(leftIndex)
    needQuerysIndex.push(rightIndex)

    
    //node左边界 与m4左边界重合;或Node右边界与M4右边界重合
    //的情况相对简单，只与M4_array[i]这一个M4有关
    if(type==4 || type == 6){
        //递归的向左右孩子分裂
        let tmpIndex1=devisionNodeIndex(type, segmentTree1, leftChild, M4_array, i, func)
        needQuerysIndex.push(...tmpIndex1)
        let tmpIndex2=devisionNodeIndex(type, segmentTree1, rightChild, M4_array, i, func)
        needQuerysIndex.push(...tmpIndex2)
        return needQuerysIndex
    }

    // 7,8不仅与M4_array[i]这一个M4有关，还与下一个M4_array[i+1]这个M4有关
    if(type==7 || type == 8){
        //递归的向左右孩子分裂   i  
        let tmpIndex1=devisionNodeIndex(type, segmentTree1, leftChild, M4_array, i, func)
        needQuerysIndex.push(...tmpIndex1)
        let tmpIndex2=devisionNodeIndex(type, segmentTree1, rightChild, M4_array, i, func)
        needQuerysIndex.push(...tmpIndex2)

        //递归的向左右孩子分裂   i+1
        if(i+1 < M4_array.length){
            let tmpIndex3=devisionNodeIndex(type, segmentTree1, leftChild, M4_array, i+1, func)
            needQuerysIndex.push(...tmpIndex3)
            let tmpIndex4=devisionNodeIndex(type, segmentTree1, rightChild, M4_array, i+1, func)
            needQuerysIndex.push(...tmpIndex4)
        }
        
        return needQuerysIndex
    }
    


    //注意一下，对这种innerNodes的处理，在division外部已经处理了，看一下是否会处理重复。
}

function isSameInterval(stInterval, etInterval){
    return stInterval.sTime == etInterval.sTime && stInterval.eTime == etInterval.eTime

}

function devisionNodeIndexAVG_W(segmentTree1, node, M4_array, i, leaves){
    let m4 = M4_array[i]
    let m4_n = null  // next m4
    let m4_p = null  // previous m4
    let type = null
    let type_n = null
    let type_p = null


    type = ContainInnerNodes(node, m4.stInterval.eTime, m4.etInterval.sTime)
    if(i >0){
        m4_p  = M4_array[i-1]
        type_p = ContainInnerNodes(node, m4_p.stInterval.eTime, m4_p.etInterval.sTime)
    }
    if(i<M4_array.length-1){
        m4_n = M4_array[i+1]
        type_n = ContainInnerNodes(node, m4_n.stInterval.eTime, m4_n.etInterval.sTime)
    }

    if(type == 1 || type == 3){
        return []
    }

    if(type_p == 2){
        //前一个m4也包含，前一个会捎带梳理，这一个不用管了
        return []
    }

    if(node.sTime > m4.stInterval.eTime && node.eTime < m4.etInterval.sTime){
        // 完全在inner 的范围
        m4.innerNodes.push(node.index)
        return []
    }

    
    // 前面条件都不符合，说明 1、该node不包含前一个m4的inner部分，2、该node包含本m4的inner部分，且包含inner以外的部分，需要分裂

    let{leftChild, rightChild} = getChildren(segmentTree1,node.index)
    let needQuerysIndex = []
    let tt = []

    needQuerysIndex.push(...[leftChild.index, rightChild.index])
    segmentTree1.minDLL.parentToChildren(node.index,leftChild.index,rightChild.index)
    segmentTree1.maxDLL.parentToChildren(node.index,leftChild.index,rightChild.index)

    //递归的向左右孩子分裂   i  
    let tmpIndex1 = devisionNodeIndexAVG_W(segmentTree1, leftChild, M4_array, i, leaves)
    needQuerysIndex.push(...tmpIndex1)
    let tmpIndex2 = devisionNodeIndexAVG_W(segmentTree1, rightChild, M4_array, i, leaves)
    needQuerysIndex.push(...tmpIndex2)

    
    
    if (type_n == 2) {
        //该node还包含下一个m4的部分inner 递归的向左右孩子分裂   i+1
        let tmpIndex3 = devisionNodeIndexAVG_W(segmentTree1, leftChild, M4_array, i + 1, leaves)
        needQuerysIndex.push(...tmpIndex3)
        let tmpIndex4 = devisionNodeIndexAVG_W(segmentTree1, rightChild, M4_array, i + 1, leaves)
        needQuerysIndex.push(...tmpIndex4)
    }



    return needQuerysIndex

}

function ContainInnerNodes(node, t1, t2){
   
    if(node.eTime <= t1){
        //在左边，不包含innerNodes
        return 1
    }

    // stInterval.etime, etInterval.sTime
    if(node.eTime > t1 && node.sTime < t2){
        //包含innerNodes
        return 2
   }

   if(node.sTime >= t2){
        // 在右边，不包含innerNodes
        return 3
   }

   return -1
}

async function fenlieAVG_W(segmentTrees, width, M4_array, func){
    let { StartIndex, EndIndex } = getTreeLastSE(segmentTrees[0], width);
    let i = 0;
    let j = StartIndex;
    let computeArrayIndex = [];
    let needQueryIndex = [];
    let leaves = []

    for(let a = StartIndex;a<=EndIndex;a++){
        computeArrayIndex.push(a)
    }
    segmentTrees[0].minDLL.constructFromList(computeArrayIndex)
    segmentTrees[0].maxDLL.constructFromList(computeArrayIndex)


    for(i=0;i<M4_array.length;i++){
       let  m4 = M4_array[i]
        tt = getLeaves(segmentTrees[0], m4.stInterval.sTime, m4.stInterval.eTime)
        m4.stInterval.nodes.push(...tt)
        leaves.push(...tt)

        tt = getLeaves(segmentTrees[0], m4.etInterval.sTime, m4.etInterval.eTime)
        m4.etInterval.nodes.push(...tt)
        leaves.push(...tt)
    }


    await fenlie(StartIndex, M4_array, EndIndex, segmentTrees, func, leaves)


    //await Multi_Query(needQueryIndex,leaves, segmentTrees);



    // while (i < M4_array.length && j <= EndIndex) {
    //     let node = segmentTrees[0].nodes[j];
    //     let m4 = M4_array[i];
    //     let tt = [];

    //     let type = ContainInnerNodes(node, m4.stInterval.eTime, m4.etInterval.sTime)

    //     if(type == 1){
    //         j++
    //         continue
    //     }

    //     if(type == 2){
    //         // node 有一部分在inner中，需要分裂
    //         tt = devisionNodeIndexAVG_W(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
    //         needQueryIndex.push(...tt);
    //         j++;
    //     }

    //     if(type == 3){
    //         i++
    //     }

    // }



}


function computeIntervalAVG_W(segmentTree, leaves, func, leftHalf){
    let sum = 0
    for(let i=0;i<leaves.length;i++){
        sum += segmentTree.nodes[leaves[i]].max * func.extremes[i+leftHalf]
    }

    return sum/func.extremes.length
}

function getMidIndex(array){
    return (array.length % 2 == 0)? array.length / 2 : (array.length - 1) / 2;
}

function getSubWeights_old(node, sTime, eTime, midTime, weights){
    let sub_weights = []
    let s = Math.max(node.sTime, sTime);
    let e = Math.min(node.eTime, eTime);

    let mid_index = getMidIndex(weights);
    let index_diff = midTime - mid_index;

    for(let i = s; i <= e; i++){
        if(i - index_diff >= 0 && i - index_diff < weights.length){
            sub_weights.push(weights[i - index_diff])
        }
    }

    return sub_weights;
}


function getSubWeights(node, sTime, eTime, midTime, weights){
    let sub_weights = []
    let leftHalf = Math.floor(weights.length/2)
    let rightHalf = Math.floor((weights.length-1)/2)

    let sTimeOfW = midTime-leftHalf
    let eTimeOfW = midTime+rightHalf

    let sTimeOfW_sub = Math.max(node.sTime,sTimeOfW)
    let eTimeOfW_sub = Math.min(node.eTime,eTimeOfW)

    if(eTimeOfW_sub<sTimeOfW_sub){
        return []
    }

    let sIndexOfW = sTimeOfW_sub - sTimeOfW
    let eIndexOfW = sIndexOfW + (eTimeOfW_sub-sTimeOfW_sub)

    sub_weights = weights.slice(sIndexOfW, eIndexOfW+1)
    

    return sub_weights;
}

function calculateForAVG_W_sub(node, subweights, destination){

    let result = 0;

    let node_range = node.eTime - node.sTime + 1;
    if(subweights.length > node_range){
        console.error('Weights is longer than node!');
    } else if(subweights.length < node_range){
        switch(destination){
            case 'min':
                subweights.forEach(element => {
                    if(element >= 0){
                        result += element * node.min;
                    } else{
                        result += element * node.max;
                    }
                });
                result =  result 
                break;
            
            case 'max':
                subweights.forEach(element => {
                    if(element >= 0){
                        result += element * node.max;
                    } else{
                        result += element * node.min;
                    }
                });
                result =  result 
                break;
        }

    } else{
        let maxExist = false;
        let minExist = false;
        let min = Infinity;
        let max = -Infinity;
        switch(destination){
            case 'min':
                subweights.forEach(element => {

                    if(element < min) min = element;
                    if(element > max) max = element;

                    if(element >= 0){
                        result += element * node.min;
                        minExist = true;
                    } else{
                        result += element * node.max;
                        maxExist = true;
                    }
                });

                if(!maxExist) result = result + min * (node.max - node.min);
                if(!minExist) result = result + max * (node.min - node.max);
                result =  result 
                break;
            
            case 'max':
                subweights.forEach(element => {

                    if(element < min) min = element;
                    if(element > max) max = element;

                    if(element >= 0){
                        result += element * node.max;
                        maxExist = true;
                    } else{
                        result += element * node.min;
                        minExist = true;
                    }
                });

                if(!minExist) result = result + min * (node.min - node.max);
                if(!maxExist) result = result + max * (node.max - node.min);
                result =  result 
                break;
        }
    }

    return result;

}

function calculateForAVG_W(segmentTree, leftNodeList,leftNum, midTime, innernode, innerNum, rightNodeList,rightNum, weights, destination){
    
    let leftHalf = Math.floor(weights.length/2)
    let rightHalf = Math.floor((weights.length-1)/2)
    
    let subweights = []
    let sum = 0
    
    let leftSTime = midTime-leftHalf
    let leftETime = leftSTime+leftNum-1
    for(let i=0;i<leftNodeList.length;i++){
        let node = segmentTree.nodes[leftNodeList[i]]
        subweights = getSubWeights(node,leftSTime,leftETime,midTime,weights)
        sum += calculateForAVG_W_sub(node, subweights, destination)
    }

    subweights = getSubWeights(innernode,innernode.sTime,innernode.sTime+innerNum-1,midTime,weights)
    sum += calculateForAVG_W_sub(innernode, subweights, destination)


    let rightETime = midTime+rightHalf
    let rightSTime = rightETime-rightNum+1
    for(let i=0;i<rightNodeList.length;i++){
        let node = segmentTree.nodes[rightNodeList[i]]
        subweights = getSubWeights(node,rightSTime,rightETime,midTime,weights)
        sum += calculateForAVG_W_sub(node, subweights, destination)
    }

    return sum/weights.length

}

//需要滑动计算，
function CalulateUnLeafAVG_W( segmentTrees, index, func, m4){
    let node = segmentTrees[0].nodes[index]

    let Max = -Infinity
    let Min = Infinity

    let leftValue, midVlaue, rightValue, fullVlaue
    let leftNodeList = [], rightNodeList = [], calculateList = []

    let leftHalf = Math.floor(func.extremes.length/2)
    let rightHalf = Math.floor((func.extremes.length-1)/2)

    for(let i=node.sTime;i<=node.eTime;i++){
        let leftNum = Math.max(leftHalf-(i-node.sTime), 0)
        let rightNum = Math.max(rightHalf-(node.eTime-i), 0)
        let innerNum = func.extremes.length-(leftNum+rightNum)
        let midTime = i

        //for min 
        leftNodeList = getNodesIndexFront(i, i-node.sTime+1 + leftNum, index, segmentTrees[0].minDLL, segmentTrees[0])
        rightNodeList = getNodesIndexLast(i, node.eTime-i+1 + rightNum, index,segmentTrees[0].minDLL, segmentTrees[0])

        let tmpMin = calculateForAVG_W(segmentTrees[0], leftNodeList,leftNum, midTime, node, innerNum, rightNodeList,rightNum, func.extremes, 'min')
    
        if(tmpMin<Min){
            Min = tmpMin
        }

        //for max
        leftNodeList = getNodesIndexFront(i, i-node.sTime+1 + leftNum, index, segmentTrees[0].maxDLL, segmentTrees[0])
        rightNodeList = getNodesIndexLast(i, node.eTime-i+1 + rightNum, index,segmentTrees[0].maxDLL, segmentTrees[0])

        let tmpMax = calculateForAVG_W(segmentTrees[0], leftNodeList,leftNum, midTime, node, innerNum, rightNodeList,rightNum, func.extremes, 'max')
    
        if(tmpMax>Max){
            Max = tmpMax
        }

    }

    return {
        tmpmin: Min,
        tmpmax: Max
    }

}


async function initM4AVG_W(segmentTrees,M4_array,func, mode, parallel) {
    let needQueryIndex = []
    let leaves = []
    let tmpNeed = []
    


    for(let i=0;i<M4_array.length;i++){
        


        //init m4
        M4_array[i].alternativeNodesMax=new MaxHeap()
        M4_array[i].alternativeNodesMin=new MinHeap()
        M4_array[i].isCompletedMax=false
        M4_array[i].isCompletedMin=false
        M4_array[i].currentComputingNodeMax = []
        M4_array[i].currentComputingNodeMin = []

        //计算边界node
        // 计算M4 的s、e时间的interval 的avg
        //注意！！！！移到外面做
        //ComputeSTAVG(segmentTrees, M4_array, func, width, mode, symble, parallel)

        // 计算M4 的s、e时间的interval 的avg
        if(i == 0){
            let leftHalf = Math.floor(func.extremes.length/2)
            M4_array[i].st_v = computeIntervalAVG_W(segmentTrees[0], M4_array[i].stInterval.nodes, func ,leftHalf)
            M4_array[i].et_v = computeIntervalAVG_W(segmentTrees[0], M4_array[i].etInterval.nodes, func ,0)
        }else{
            M4_array[i].st_v = computeIntervalAVG_W(segmentTrees[0], M4_array[i].stInterval.nodes, func ,0)
            M4_array[i].et_v = computeIntervalAVG_W(segmentTrees[0], M4_array[i].etInterval.nodes, func ,0)
        }



            if( M4_array[i].st_v < M4_array[i].et_v){
                M4_array[i].min = M4_array[i].st_v
                M4_array[i].max = M4_array[i].et_v

            }else{
                M4_array[i].min = M4_array[i].et_v
                M4_array[i].max = M4_array[i].st_v
            }

        if(M4_array[i].innerNodes.length == 0){
            M4_array[i].isCompletedMax=true
            M4_array[i].isCompletedMin=true

            continue

        }


        

        //计算inner node
        //将m4.innerNodes全部放入候选队列
        //这里，默认 interval较小，最初的分裂，是不会达到小于interval的“叶子”
        for(let j=0;j<M4_array[i].innerNodes.length;j++){
            let index = M4_array[i].innerNodes[j]

            if(i == 5){
                debug = true
            }

            let {tmpmin,tmpmax}=CalulateUnLeafAVG_W(segmentTrees, index, func, M4_array[i])


            let max_e = Object.create(element)
            max_e.value=tmpmax
            max_e.index=index
            M4_array[i].alternativeNodesMax.add(max_e)

            let min_e = Object.create(element)
            min_e.value=tmpmin
            min_e.index=index
            M4_array[i].alternativeNodesMin.add(min_e)
        }


       
        
        //计算的4步：从候选结点取，与m4.max和m4.min比较，赋给Current，获取、查询Current孩子
        let tt = huisuComputeAVG(M4_array[i], segmentTrees,func, parallel);
        needQueryIndex.push(...tt)


    }

    

    //上面计算，将要计算的节点currentComputingNodeMax的孩子存储在needQueryIndex中，从数据库查询并计算
    await Multi_Query(needQueryIndex,leaves, segmentTrees)
    
    
}


//对不需要分裂的“叶子”节点进行均值计算
//该node长度已经小于一个interval，因此只用两种情况：1、该node完全包含在一个interval中，2、该node包含两个interval的前半段和后半段
//注意！！！！！要检查一下，计算的interval是否在M4中，如果不在，则不需要计算。
function CalulateLeafAVG_W(segmentTree, index,func, m4){

    let globalStartTime = segmentTree.nodes[0].sTime, globalEndTime = segmentTree.nodes[0].eTime
    let node = segmentTree.nodes[index]

    let weights = func.extremes
    let leftHalf = Math.floor(weights.length/2)
    let rightHalf = Math.floor((weights.length-1)/2)


    let sum = 0
    let max = -Infinity
    let min = Infinity


    let leavesStartTime = Math.max(globalStartTime, node.sTime-leftHalf) 
    let leavesEndTime = Math.min(globalEndTime, node.eTime+rightHalf)
    let leaves = getLeaves(segmentTree, leavesStartTime, leavesEndTime)


    let unQueryIndex = getUnQueryIndex(segmentTree, leaves)

    if(unQueryIndex.length == 0){
        for(let i=node.sTime;i<=node.eTime;i++){
        
            sum = 0
            let leaveValue = 0

            
            
            for(let j=0;j<weights.length;j++){

                let leavesIndex = i-leftHalf-leavesStartTime +j
                if(leavesIndex<0){
                    leaveValue =0
                }else if(leavesIndex > leaves.length-1){
                    leaveValue =0
                }else{
                    leaveValue = segmentTree.nodes[leaves[leavesIndex]].min
                }

                sum += weights[j]*leaveValue 
            }

            if(sum/weights.length > max){
                max = sum/weights.length
            }
            if(min > sum/weights.length){
                min = sum/weights.length
            }
        }
        
    }

    return {
        tmpIndex:unQueryIndex, 
        tmpMin:min, 
        tmpMax:max
    } 
}


function CurrentComputeAVG_W(m4, segmentTrees,func, destination, mode){
    let needQueryIndex = []

    // for Max=========================================
    for (let i = 0; destination == 'max' && i < m4.currentComputingNodeMax.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMax[i]
        let node = segmentTrees[0].nodes[currentComputingNodeIndex]


        // 类似叶子结点的判断，这里的非“叶子”，该节点长度小于区间，则分裂到底，并进行exact 计算
        if (LessOrMore(segmentTrees[0].nodes[ currentComputingNodeIndex], func.intervalRange) < 3) {

            //step1
            let {tmpIndex, tmpMin, tmpMax} = CalulateLeafAVG_W(segmentTrees[0], currentComputingNodeIndex,func, m4)
            if(tmpIndex.length != 0){
                // 需要查询，则本轮只进行查询，下一轮再计算
                needQueryIndex.push(...tmpIndex)
                
                continue
            }
            //表示不需要查询，即上一轮已经进行了查询，本轮只需进行计算
            //step2
            if (tmpMax > m4.max) {
                //step3
                m4.max = tmpMax
            }
            m4.currentComputingNodeMax[i] = null
        } else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以max为例，
            // 大于m4当前的max的，大的给Current，小的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 小于当前的max的，不管了
            // 如果都小于m4当前的max，则该节点fail了，不需要往下，

            let { leftIndex, rightIndex } = getChildrenIndex(currentComputingNodeIndex);
            segmentTrees[0].maxDLL.parentToChildren(currentComputingNodeIndex,leftIndex,rightIndex)

            let { tmpmin: minLeft, tmpmax: maxLeft } = CalulateUnLeafAVG_W(segmentTrees, leftIndex, func, m4)
            let { tmpmin: minRight, tmpmax: maxRight } = CalulateUnLeafAVG_W(segmentTrees, rightIndex, func, m4)
            let ele = Object.create(element)


            //左右孩子都大于m4当前的max的
            if (maxLeft > m4.max && maxRight > m4.max) {
                // 大的给Current，小的进alternative
                if (maxLeft > maxRight) {
                    currentComputingNodeIndex = leftIndex
                    ele.index = rightIndex
                    ele.value = maxRight
                } else {
                    currentComputingNodeIndex = rightIndex
                    ele.index = leftIndex
                    ele.value = maxLeft
                }

                //分裂后的这个孩子在m4区间，才近alternative
                //if(ContainForAVG(segmentTrees[0][ele.index].sTime, segmentTrees[0][ele.index].eTime, m4) == 3){
                    m4.alternativeNodesMax.add(ele)
                //}

            }
            // 只有1边大于m4当前的max的
            else if (maxLeft > m4.max || maxRight > m4.max) {
                // 大的给Current，小的不管
                if (maxLeft > maxRight) {
                    currentComputingNodeIndex = leftIndex
                } else {
                    currentComputingNodeIndex = rightIndex
                }
            }
            // 如果都小于m4当前的max，则该节点fail了，不需要往下，
            else {
                currentComputingNodeIndex = null
            }

            m4.currentComputingNodeMax[i] = currentComputingNodeIndex
           
        }

    }


    // for Min=========================================
    for (let i = 0; destination == 'min' && i < m4.currentComputingNodeMin.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMin[i]
        let node = segmentTrees[0].nodes[currentComputingNodeIndex]


        // 类似叶子结点的判断，这里的非“叶子”，该节点长度小于区间，则分裂到底，并进行exact 计算
        if (LessOrMore(segmentTrees[0].nodes[ currentComputingNodeIndex], func.intervalRange) < 3) {

            //step1
            let {tmpIndex, tmpMin, tmpMax} = CalulateLeafAVG_W(segmentTrees[0], currentComputingNodeIndex, func, m4)
            if(tmpIndex.length != 0){
                // 需要查询，则本轮只进行查询，下一轮再计算
                needQueryIndex.push(...tmpIndex)
                
                continue
            }
            //表示不需要查询，即上一轮已经进行了查询，本轮只需进行计算
            //step2
            if (tmpMin < m4.min) {
                //step3
                m4.min = tmpMin
            }
            m4.currentComputingNodeMin[i] = null
        } else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以Min为例，
            // 大于m4当前的Min的，大的给Current，小的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 小于当前的Min的，不管了
            // 如果都小于m4当前的Min，则该节点fail了，不需要往下，

            let { leftIndex, rightIndex } = getChildrenIndex(currentComputingNodeIndex);

            segmentTrees[0].minDLL.parentToChildren(currentComputingNodeIndex, leftIndex, rightIndex)

            let { tmpmin: minLeft, tmpmax: maxLeft } = CalulateUnLeafAVG_W(segmentTrees, leftIndex, func, m4)
            let { tmpmin: minRight, tmpmax: maxRight } = CalulateUnLeafAVG_W(segmentTrees, rightIndex, func, m4)
            let ele = Object.create(element)


            //左右孩子都大于m4当前的Min的
            if (minLeft < m4.min && minRight < m4.min) {
                // 大的给Current，小的进alternative
                if (minLeft < minRight) {
                    currentComputingNodeIndex = leftIndex
                    ele.index = rightIndex
                    ele.value = minRight
                } else {
                    currentComputingNodeIndex = rightIndex
                    ele.index = leftIndex
                    ele.value = minLeft
                }

                //分裂后的这个孩子在m4区间，才近alternative
                //if(ContainForAVG(segmentTrees[0][ele.index].sTime, segmentTrees[0][ele.index].eTime, m4) == 3){
                    m4.alternativeNodesMin.add(ele)
               // }

            }
            // 只有1边大于m4当前的min的
            else if (minLeft < m4.min || minRight < m4.min) {
                // 大的给Current，小的不管
                if (minLeft < minRight) {
                    currentComputingNodeIndex = leftIndex
                } else {
                    currentComputingNodeIndex = rightIndex
                }
            }
            // 如果都小于m4当前的min，则该节点fail了，不需要往下，
            else {
                currentComputingNodeIndex = null
            }

            m4.currentComputingNodeMin[i] = currentComputingNodeIndex

        }

    }

    //删除null

    if (destination == 'min') {
        //console.log(m4.currentComputingNodeMin)
        m4.currentComputingNodeMin = m4.currentComputingNodeMin.filter(item => item != null);
    } else {
        //console.log(m4.currentComputingNodeMax)
        m4.currentComputingNodeMax = m4.currentComputingNodeMax.filter(item => item != null);
    }
    
    return needQueryIndex
}


async function StartCompute_AVG_W(segmentTrees,M4_array,func, mode, parallel, width,height,errorBound) {
    console.time('initM4AVG_W');
    await initM4AVG_W(segmentTrees,M4_array,func, mode, parallel)
    console.timeEnd('initM4AVG_W');

        //经过上面的处理，以及Multi_Query后，每个像素列m4里，当前要计算的节点currentComputingNodeMax，及其孩子已经查询计算得到。
    //下面开始根据currentComputingNodeMax对左右孩子进行计算

    let needQueryIndex = []
    let leaves = []
    let computedCount = 0
    while(computedCount < M4_array.length*2 ){
        //console.log(computedCount)
        computedCount = 0
        
        for(let i=0;i<M4_array.length;i++){

            if(i == 5){
                //console.log(M4_array[i])
            }
            //先计算min
            if(M4_array[i].isCompletedMin){
                computedCount++
                //console.log(computedCount)
            }
            else{
                //对M4_array[i]的Current进行计算
                tmpNeed = CurrentComputeAVG_W(M4_array[i], segmentTrees,func, 'min', mode)
                leaves.push(...tmpNeed)
            }
            
            //计算max
            if(M4_array[i].isCompletedMax){
                computedCount++
                //console.log(computedCount)
            }else{
                //对M4_array[i]的Current进行计算
                tmpNeed = CurrentComputeAVG_W(M4_array[i], segmentTrees,func, 'max', mode)
                leaves.push(...tmpNeed)
            }

            // let tt = huisuComputeAVG(M4_array[i], segmentTrees,func, parallel);
            // needQueryIndex.push(...tt)

        }


        if(errorBoundSatisfy(M4_array, width,height,errorBound)){
            break
        }


        for(let i=0;i<M4_array.length;i++){
            let tt = huisuComputeAVG(M4_array[i], segmentTrees,func, parallel);
            needQueryIndex.push(...tt)
        }





        //经过上面的for循环，相当于对m4像素列遍历了一遍，也就是对每个m4的 当前计算节点进行了计算，并把其左右孩子放入候选堆，
        //然后通过huisu，取出候选堆中的最优节点，并找到其孩子的index放入needQuery中
        await Multi_Query(needQueryIndex, leaves, segmentTrees)
        needQueryIndex = []
        leaves = []
    }



    
}

async function computeAVG_W(segmentTrees, M4_array, func, mode, symble, parallel, width,height,errorBound){



    createM4_AVG_W(func, M4_array);


 
    console.time('fenlieAVG_w'); // 开始计时   
    //遍历像素列M4：
    await fenlieAVG_W(segmentTrees, width, M4_array, func);
    console.timeEnd('fenlieAVG_w'); // 结束计时并打印结果

    console.time('Start_AVG_Compute'); // 开始计时   
    //M4.innerNode,表示在M4像素列里的node，这些node是需要进行计算的
    //经过上面的while循环后，确定了所有需要计算的节点，保存在每个的M4.innerNode,表示在M4像素列里的node，这些node是需要进行计算的
    
    //按symble运算符or函数，对按照SegmentTree1,SegmentTree2树结构，对M4_array中的节点进行计算，得到。
    await StartCompute_AVG_W(segmentTrees,M4_array,func, mode, parallel, width,height,errorBound)


    console.timeEnd('Start_AVG_Compute'); // 结束计时并打印结果
    console.log('totlaNodes:',Object.keys(segmentTrees[0].nodes).length)

    return M4_array

}

async function computeAVG(segmentTrees, M4_array, func,width,height, mode, symble, parallel,errorBound){

    
    createM4_AVG(func, M4_array);



 
    console.time('fenlieAVG'); // 开始计时   
    //遍历像素列M4：
    await fenlieAVG(segmentTrees, width, M4_array);
    console.timeEnd('fenlieAVG'); // 结束计时并打印结果

    console.time('Start_AVG_Compute'); // 开始计时   
    //M4.innerNode,表示在M4像素列里的node，这些node是需要进行计算的
    //经过上面的while循环后，确定了所有需要计算的节点，保存在每个的M4.innerNode,表示在M4像素列里的node，这些node是需要进行计算的
    
    //按symble运算符or函数，对按照SegmentTree1,SegmentTree2树结构，对M4_array中的节点进行计算，得到。
    await Start_AVG_Compute(segmentTrees,M4_array,width,height,func, mode, parallel,errorBound)


    console.timeEnd('Start_AVG_Compute'); // 结束计时并打印结果



    console.log('totlaNodes:',Object.keys(segmentTrees[0].nodes).length)

    return M4_array

}


function getInterval_w(globalStart,globalEnd, time, range){
    let interval = new Interval(0,0)

    let leftHalf = Math.floor(range/2)
    let righttHalf = Math.floor((range-1)/2)

    if(time == globalStart){
        interval.sTime=globalStart
        interval.eTime=time+righttHalf

    }else if(time ==globalEnd){
        interval.sTime=time-leftHalf
        interval.eTime=globalEnd
    }else{
        interval.sTime=time-leftHalf
        interval.eTime=time+righttHalf
    }
   

    return interval

}

function createM4_AVG_W(func, M4_array){
    let intervalRange = func.extremes.length;
    let globalStart = M4_array[0].start_time;
    let globalEnd = M4_array[M4_array.length - 1].end_time;

    //step 1 计算每个M4的start、end，属于哪一段interval
    for (let i = 0; i < M4_array.length; i++) {
        M4_array[i].stInterval = getInterval_w(globalStart, globalEnd, M4_array[i].start_time, intervalRange);
        M4_array[i].etInterval = getInterval_w(globalStart, globalEnd, M4_array[i].end_time, intervalRange);
    }
}

function createM4_AVG(func, M4_array) {
    let intervalRange = func.extremes[0];
    let globalStart = M4_array[0].start_time;
    let globalEnd = M4_array[M4_array.length - 1].end_time;

    //step 1 计算每个M4的start、end，属于哪一段interval
    for (let i = 0; i < M4_array.length; i++) {
        M4_array[i].stInterval = getInterval(globalStart, globalEnd, M4_array[i].start_time, intervalRange);
        M4_array[i].etInterval = getInterval(globalStart, globalEnd, M4_array[i].end_time, intervalRange);

        //如果当前m4的stInterval 与前一个m4的etInterval重合，则当前M4的stInterval不需要计算，直接去前一个m4的etInterval
        if (i == 0) {
            //continue
        } else {
            if (isSameInterval(M4_array[i].stInterval, M4_array[i - 1].etInterval)) {
                M4_array[i].stInterval = M4_array[i - 1].etInterval;
                M4_array[i].stInterval.isSame = true;
            } else {
                M4_array[i].stInterval.isSame = false;
            }
        }
    }
}

async function fenlieAVG(segmentTrees, width, M4_array) {
    let { StartIndex, EndIndex } = getTreeLastSE(segmentTrees[0], width);
    let i = 0;
    let j = StartIndex;
    let computeArrayIndex = [];
    let needQueryIndex = [];
    let leaves = []

    while (i < M4_array.length && j <= EndIndex) {
        let node = segmentTrees[0].nodes[j];
        let m4 = M4_array[i];
        let tt = [];


        //console.log('while',i,j)
        //依次判断每个treeNode与当前像素列M4的关系：
        let { typeS, typeE } = isContainAVG(node, m4);
        let type = isContain(node, m4);

        //====================================
        if (typeS == 1) {
            //说明node在m4开始interval的左边，不需要处理
            j++;
            continue;
        }

        if (typeS == 2) {
            //说明node一部分在当前m4的stInterval中，
            if (m4.stInterval.isSame) {
                //说明该M4的stInterval与前一个m4的etInterval相同，因此不需要处理。
                j++;
                continue;
            }

            tt = devisionNodeIndexAVG(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
            needQueryIndex.push(...tt);
            j++;
            continue;
        }

        if (typeS == 5) {
            //说明node一部分在当前m4的stInterval中，
            tt = devisionNodeIndexAVG(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
            needQueryIndex.push(...tt);
            j++;
            continue;
        }

        if (typeS == 3) {
            //node 完全在m4开始interval的内部，这个node需要分裂到叶子结点，并给interval提供计算
            if (m4.stInterval.isSame) {
                //说明该M4的stInterval与前一个m4的etInterval相同，因此不需要处理。
                j++;
                continue;
            }

            tt = getLeaves(segmentTrees[0], node.sTime, node.eTime);
            m4.stInterval.nodes.push(...tt);
            leaves.push(...tt);
            j++;
            continue;
        }

        if (typeS == 4) {
            if (typeE == 1) {
                // 该node只与m4开始interval有重叠，但与m4结束的interval没有重叠
                //需要对该节点进行向下分裂，。
                tt = devisionNodeIndexAVG(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
                needQueryIndex.push(...tt);
                j++;
                continue;
            } else if (typeE == 2) {
                // 该node与m4开始interval有重叠，且与m4结束的interval有重叠，但没有向右伸出结束的interval
                //需要对该节点进行向下分裂，。
                tt = devisionNodeIndexAVG(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
                needQueryIndex.push(...tt);
                j++;
                continue;
            } else if (typeE == 5) {
                // 该node与m4开始interval有重叠，且与m4结束的interval有重叠，且向右伸出结束的interval，说明与下一个M4产生了重叠
                //需要对该节点进行向下分裂，。
                tt = devisionNodeIndexAVG(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
                needQueryIndex.push(...tt);
                j++;
                i++;
                continue;
            }
        }

        if (typeS == 6) {
            if (typeE == 1) {
                //node 完全在m4开始interval的右边，结束interval的左边，说明该node是innernode
                m4.innerNodes.push(j);
                j++;
                continue;
            } else if (typeE == 2) {
                // 该与m4结束的interval有重叠，但没有向右伸出结束的interval
                //需要对该节点进行向下分裂，。
                tt = devisionNodeIndexAVG(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
                needQueryIndex.push(...tt);
                j++;
                continue;
            } else if (typeE == 3) {
                //node 完全在m4结束interval的内部，这个node需要分裂到叶子结点，并给interval提供计算
                tt = getLeaves(segmentTrees[0], node.sTime, node.eTime);
                m4.etInterval.nodes.push(...tt);
                leaves.push(...tt);
                j++;
                continue;
            } else if (typeE == 4) {
                // 该node与m4结束的interval有重叠，且向右伸出结束的interval，说明与下一个M4产生了重叠
                tt = devisionNodeIndexAVG(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
                needQueryIndex.push(...tt);
                j++;
                i++;
                continue;
            } else if (typeE == 5) {
                //说明该node完全包住m4结束的interval，且向右延伸至下一个m4
                tt = devisionNodeIndexAVG(segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, leaves);
                needQueryIndex.push(...tt);
                j++;
                i++;

            } else if (typeE == 6) {
                // 该node与m4结束的interval没有重叠，完全在其右边，说明已经进入下一个M4
                i++;
            }

        }

    }


    await Multi_Query(needQueryIndex,leaves, segmentTrees);
}

async function computeMultyOrSingle(tables, func, width,height, mode, symble, parallel, errorBound,screenStart,screenEnd){

//      let ww = width
// //     const args = process.argv.slice();
// // if(args[args.length-1] == 'debug')
// // {
// //     console.log('debug');
// //     ww = 100000

// // }

    if(mode == 'single'){
        tables = [tables[0]]
    }

    //构建树
    let segmentTrees = []
    for(let i=0;i<tables.length;i++){
        //console.time('buildtree-total'); // 开始计时
        segmentTrees.push(await buildtree(tables[i], width, screenStart,screenEnd))
        //console.timeEnd('buildtree-total'); // 结束计时并打印结果
    }


    //构建M4数组，width个M4元素。
    let realDataRowNum = getRealDataRowNum(segmentTrees[0], segmentTrees[0])
    //realDataRowNum = 63
    //to repair经测试，待修改。

    if(isNaN(screenStart)){
        screenStart = 0
    }
    if(isNaN(screenEnd)){
        screenEnd = realDataRowNum-1
    }

    console.log(screenStart, screenEnd)

    let M4_array = computeM4TimeSE(width, [screenStart, screenEnd])


    // 情况1：如果树的数据量较少或者width较大，导致树直接干到了底层，那么是不需要query了，直接进行计算。
    // if（判定条件），then compute（）// 最后考虑。



    // 情况2：没有到底层，则需要进行query和compute
    // query要直接查询到底，不断生成compute，
    // 然后对compute依次计算

    // 从SegmentTree1的最底层开始
    // 找到该层的第一个节点StartIndex和最后一个节点的EndIndex，
    // 从 SegmentTree1.nodes[StartIndex]~SegmentTree1.nodes[EndIndex]


    //找到该层的第一个节点StartIndex和最后一个节点的EndIndex，
    let {StartIndex,EndIndex} = getTreeLastSE(segmentTrees[0],width, screenStart, screenEnd)



    if(func.funName == 'avg'){

        return await computeAVG([segmentTrees[0]],M4_array,func,width,height,mode,symble,parallel,errorBound)
        
    }else if(func.funName == 'avg_w' ){
        return await computeAVG_W([segmentTrees[0]],M4_array,func,mode,symble,parallel, width,height,errorBound)
    }


    //遍历像素列M4：
    //console.time('fenlie'); // 开始计时   

    await fenlie(StartIndex, M4_array, EndIndex, segmentTrees, func, []);

    //console.timeEnd('fenlie'); // 结束计时并打印结果
    
    //M4.innerNode,表示在M4像素列里的node，这些node是需要进行计算的
    //经过上面的while循环后，确定了所有需要计算的节点，保存在每个的M4.innerNode,表示在M4像素列里的node，这些node是需要进行计算的
    
    //按symble运算符or函数，对按照SegmentTree1,SegmentTree2树结构，对M4_array中的节点进行计算，得到。
    await Start_Multi_Compute(segmentTrees,M4_array,func, mode, parallel, width,height,errorBound)



    return M4_array
}


class FunInfo{
    constructor(funName, extremes){
        this.funName = funName;
        this.intervalRange = 0
        this.extremes = []
        if(extremes != null){
            this.extremes.push(...extremes)
        }
    };

    compute(x){
        let y = x + 1

        return y
    }
    //根据funName函数体，依次计算Xs的函数值，返回Ys数组
    computes(Xs){

        let Ys=[]
        for(let i=0;i<Xs.length;i++)
        {
            //todo
            //Ys.push(sin()+cos()+....)
            let x=Xs[i]
            let y=this.compute(x)

            Ys.push(y)
        }
        
        return Ys
    }

}



async function fenlie(StartIndex, M4_array, EndIndex, segmentTrees, func, leaves) {
    let i = 0;
    let j = StartIndex;
    let computeArrayIndex = [];
    let computeArrayUnqueryIndex = [];
    while (i < M4_array.length && j <= EndIndex) {



        //console.log('while',i,j)
        //依次判断每个treeNode与当前像素列M4的关系：
        let type = isContain(segmentTrees[0].nodes[j], M4_array[i]);
        if (type < 0) {
            // 说明直接就分裂到叶子结点层了，暂时不做处理，后面补上，同上面”情况1：“
            break;
        }

        //type=1,2,3,理论上讲，需要对该节点进行分裂，但因为M4和treenode都是有序的，所以这总情况会在前一个M4被处理掉。
        if (type === 4) {
            //需要对该节点进行向下分裂，直至底层。
            let needQuerysIndex = devisionNodeIndex(type, segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, func);
            computeArrayUnqueryIndex.push(...needQuerysIndex);
            j++;
            continue;
        }
        if (type === 5) {
            M4_array[i].innerNodes.push(j);
            j++;
            continue;
        }
        if (type === 6 || type === 7 || type === 8) {
            //需要对该节点进行向下分裂，直至底层。
            let needQuerysIndex = devisionNodeIndex(type, segmentTrees[0], segmentTrees[0].nodes[j], M4_array, i, func);
            computeArrayUnqueryIndex.push(...needQuerysIndex);
            j++;
            i++;
            continue;
        }

        if (type === 9) {
            i++;
            continue;
        }
    }

    //对computeArrayUnqueryIndex进行查询，并加到computeArray中。
    let tempArrayIndex = await Multi_Query(computeArrayUnqueryIndex, leaves, segmentTrees);
}

function outputM4(M4_array){


    for(let key in stats.callCounts){
        timetotal(key)
    }



    return

    for(let i=0;i<M4_array.length;i++){
        let m4 = M4_array[i]
        console.log(
            'm4:',i
            ,'sT:',m4.start_time
            , ',eT:',m4.end_time
            , ',sV:',m4.st_v.toFixed(3)
            , ',eV:',m4.et_v.toFixed(3)
            , ',min:',m4.min.toFixed(3)
            , ',max:',m4.max.toFixed(3)
         )
    }



}

async function om3(table1,table2,symble,extremes,width,height,mode,parallel,errorBound,screenStart,screenEnd){




    //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
    let funInfo = new  FunInfo(symble,extremes)
    
    if(funInfo.funName == 'avg'){
        funInfo.intervalRange = funInfo.extremes[0]
        
    }else if(funInfo.funName == 'avg_w' ){
        funInfo.intervalRange = funInfo.extremes.length
    }

    //let currentPool = pool

    // let M4_array = multi_compute(table1, table2, symbol, width)



    let M4_array = await computeMultyOrSingle([table1,table2], funInfo, width,height, mode, symble, parallel, errorBound,screenStart,screenEnd)
    //let M4_array = await computeMultyOrSingle([table1], funInfo, width, 'single', symbol, parallel)


    outputM4(M4_array)

    //向客户端发送M4_array结果
    //send(M4_array)



  



    return


 
}

async function excuteSQL(querySQL, i) {
    
    const queryData = await pool.query(querySQL);
    return queryData
}

async function profile(func, ...params) {
    console.time(func.name); // 开始计时
    const result = await func(...params); // 执行函数
    console.timeEnd(func.name); // 结束计时并打印结果
    return result;
}
 


async function start(){

    const args = process.argv.slice();

    let table1=args[2]
    let table2=args[3]
    let symble = args[4]
    let extremes = null
    if(args[5] != ''){
        extremes = args[5].split(",").map(Number);
    }
    let width= Number(args[6])
    let height = Number(args[7])
    let experiment = args[8]
    let mode = args[9] //multi or single
    let screenStart = Number(args[10])
    let screenEnd = Number(args[11])
    let parallel = Number(args[12])
    let errorBound = Number(args[13])



    console.log(screenStart,screenEnd,parallel,errorBound)

    switch(experiment){
        case 'om3':
            await om3(table1,table2,symble,extremes,width,height,mode,parallel,errorBound,screenStart,screenEnd)
            break; 
        case 'case1':
            await Case1(table1, table2, width, symble ,extremes,screenStart,screenEnd);break;
        case 'case2':
            await Case2(table1, table2, width, symble ,extremes,screenStart,screenEnd);break;
        case 'case3':
            await Case3(table1, table2, width, symble ,extremes,screenStart,screenEnd);break;
        case 'case4':
            await Case4(table1, table2, width, symble ,extremes,screenStart,screenEnd);break;
        case 'case5':
            await Case5(table1, table2, width, symble ,extremes,screenStart,screenEnd);break;
        
        case 'test':
            test();break
    }



}





const stats = {
    functionTimes: {},
    startTimes: {},
    callCounts: {}  // 新增用于记录调用次数
};

// 开始计时函数
function timestart(functionName) {
    stats.startTimes[functionName] = performance.now();
}

// 结束计时函数
function timeend(functionName) {
    if (!stats.startTimes[functionName]) {
        console.error(`No start time recorded for ${functionName}`);
        return;
    }

    const startTime = stats.startTimes[functionName];
    const endTime = performance.now();
    const timeSpent = endTime - startTime;

    // 更新总时间
    if (!stats.functionTimes[functionName]) {
        stats.functionTimes[functionName] = 0;
    }
    stats.functionTimes[functionName] += timeSpent;

    // 更新调用次数
    if (!stats.callCounts[functionName]) {
        stats.callCounts[functionName] = 0;
    }
    stats.callCounts[functionName]++;

    // 清除开始时间
    delete stats.startTimes[functionName];
}

// 输出统计数据函数
function timetotal(functionName) {
    const totalTime = stats.functionTimes[functionName];
    const count = stats.callCounts[functionName] || 0;
    
    if (totalTime !== undefined) {
        console.log(`Total time for ${functionName}: ${totalTime.toFixed(2)} ms, called ${count} times`);
    } else {
        console.log(`No timing data for ${functionName}`);
    }
}





function test(){

    const numbers = [5, 2, 9, 1, 5, 6];
const min = Math.min(...numbers);
console.log(min); // 输出：1
}

// 使用profile函数计算并打印slowFunction的执行时间
 profile( start);


 //test()
 //test_computeM4TimeSE()


 function test_computeM4TimeSE(){
    const args = process.argv.slice();
    let width=args[2]
    let num=args[3]
    console.log(width,num)
    let M4_array = computeM4TimeSE(width, [0, num-1])
    for(let i=0;i<M4_array.length;i++){
        console.log(
            'start_time:',M4_array[i].start_time
          , ', end_time:',M4_array[i].end_time

       )
    }
 }


 function weigthedAverage(sequence, weights){
    let mid_index = getMidIndex(weights);
    // console.log(mid_index)

    let result = []
    for(let i = 0; i < sequence.length; i++){


        let element = 0;
        let l = 0;
        for(let j = -mid_index; j < weights.length - mid_index; j++){
            let w_index = mid_index + j;
            let s_index = i + j;
            if(s_index >= 0 && s_index < sequence.length){
                element += sequence[s_index] * weights[w_index];
                l++;
            }
        }
        element = element / weights.length;

        // console.log(i,':'
        //     ,element.toFixed(3))

        result.push(element);
    }

    

    return result;
}

 async function wAvgCase1(table1, width, weights) {
    console.log('wAvgCase1');
    let t3 = [];

    let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1} ORDER BY t ASC`;
    let result1 = await pool.query(sql);

    const length = result1.rows.length;

    // 读出的是字符串型，转整数/浮点数，如果pg已改，可删
    result1.rows.forEach(e => {
        e.t = parseInt(e.t);
        e.v = parseFloat(e.v);
    })

    let seq = [];
    result1.rows.forEach(e =>{
        seq.push(e.v);
    })

    let weighted_seq = weigthedAverage(seq, weights);
    for(let i = 0; i < result1.rows.length; i++){
        t3.push({ t: result1.rows[i].t, v: weighted_seq[i]});
    }

    let num = t3.length

    let PARTITION = Math.floor(num/width)

    let res = computeM4TimeSE(width, [0, num - 1])
    res.forEach(e =>{
        let min = Infinity;
        let max = -Infinity;
        for(let i = e.start_time; i <= e.end_time; i++){
            // console.log(t3[i].v)
            if(t3[i].v < min){
                min = t3[i].v
            }

            if(t3[i].v > max){
                max = t3[i].v
            }
        }
        e.min = min
        e.max = max
        e.st_v = t3[e.start_time].v
        e.et_v = t3[e.end_time].v
    })

    outputM4(res)

    return res;

}



async function testFunc(table1, width, extremes){
    let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1} order by t asc `
    let result1 = await pool.query(sql);

       // todo 两表相加，并输出width的M4数组
       let t3 = new Array(result1.rows.length)

    let func = new FunInfo('test',[])


    for (let i = 0; i < result1.rows.length; i++) {
        let t = result1.rows[i].t
        let v = func.compute(result1.rows[i].v)

        //console.log(result1.rows[i].v , result2.rows[i].v,result1.rows[i].v + result2.rows[i].v)

        let pair = { t: t, v: v };
        t3[i] = pair
    };
            
   
   
       let num = t3.length
   
   
       let PARTITION = Math.floor(num/width)
   
       let res = computeM4TimeSE(width, [0, num - 1])
       // let min_arr = []
       // let max_arr = []
       res.forEach(e =>{
           let min = Infinity;
           let max = -Infinity;
           for(let i = e.start_time; i <= e.end_time; i++){
   
               if(t3[i].v < min){
                   min = t3[i].v
               }
   
               if(t3[i].v > max){
                   max = t3[i].v
               }
           }
           e.min = min
           e.max = max
           e.st_v = t3[e.start_time].v
           e.et_v = t3[e.end_time].v
       })
   
       outputM4(res)
   
       return res;

}

 // 两表分别从数据库取出来，程序做加法，程序做M4
 async function Case1(table1, table2, width, symbol ,extremes){
    console.log('Case1')


    if(symbol == 'avg'){
        await avgCase1(table1, width, extremes[0])

        return 
    }

    if(symbol == 'avg_w'){
        await wAvgCase1(table1, width, extremes)

        return 
    }

    if(symbol == 'testFunc'){
        await testFunc(table1, width, extremes)

        return 
    }


    let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1} order by t asc `
    let result1 = await pool.query(sql);
    sql = `SELECT ${table2}.t AS t, ${table2}.v AS v FROM ${table2} order by t asc`
    let result2 = await pool.query(sql);


    // todo 两表相加，并输出width的M4数组
    let t3 = new Array(result2.rows.length)

    switch(symbol){
        case '+':
            for(let i=0;i<result1.rows.length;i++){
                let t=result1.rows[i].t
                let v = (result1.rows[i].v + result2.rows[i].v)

                //console.log(result1.rows[i].v , result2.rows[i].v,result1.rows[i].v + result2.rows[i].v)
                
                let pair = { t: t, v: v };
                t3[i] = pair
            };
            break;
        case '-':
            for(let i=0;i<result1.rows.length;i++){
                let t=result1.rows[i].t
                let v = (result1.rows[i].v - result2.rows[i].v)
                
                let pair = { t: t, v: v };
                t3[i] = pair
            };
            break;
        case '*':
            for(let i=0;i<result1.rows.length;i++){
                let t=result1.rows[i].t
                let v = (result1.rows[i].v * result2.rows[i].v)
                
                let pair = { t: t, v: v };
                t3[i] = pair
            }
            break;
        case '/':
            for(let i=0;i<result1.rows.length;i++){
                let t=result1.rows[i].t
                let v = (result1.rows[i].v / result2.rows[i].v)
                
                let pair = { t: t, v: v };
                t3[i] = pair
            }
            break;
    }


    let num = t3.length


    let PARTITION = Math.floor(num/width)

    let res = computeM4TimeSE(width, [0, num - 1])
    // let min_arr = []
    // let max_arr = []
    res.forEach(e =>{
        let min = Infinity;
        let max = -Infinity;
        for(let i = e.start_time; i <= e.end_time; i++){

            if(t3[i].v < min){
                min = t3[i].v
            }

            if(t3[i].v > max){
                max = t3[i].v
            }
        }
        e.min = min
        e.max = max
        e.st_v = t3[e.start_time].v
        e.et_v = t3[e.end_time].v
    })

    outputM4(res)

    return res;
}







 // 在数据库：两表在数据相加后，对结果做M4
 async function Case2(table1, table2, width, symbol){
    console.log('Case2')

    let sql = `select count(*) as c from ${table1}`
    let result1 = await pool.query(sql);
    
    let num = result1.rows[0].c
    

    let PARTITION = num/width

    sql = `select a.k 
			,min(a.t) as start_t 
			,max(case when a.rn = 1 then a.v end) as start_t_v 
			,max(a.t) as end_t 
			,max(case when a.rn_desc = 1 then a.v end) as end_t_v 
			,min(a.v) as min_v 
			,max(a.v) as max_v 
        from 
		(
			select round(t1/${PARTITION}) as k 
						,t1 as t 
						,v1 as v 
						,row_number() over (partition by round(t1/${PARTITION}) order by t1 ) as rn 
						,row_number() over (partition by round(t1/${PARTITION}) order by t1 desc) as rn_desc 
			from 
				( select ${table1}.t as t1
							,${table1}.v as v1
							,${table2}.t as t2
							,${table2}.v as v2
							,(${table1}.v+${table2}.v) as v3 
					from ${table1} join ${table2} on ${table1}.t=${table2}.t 
					) as b 
		) a 
					
        group by a.k order by a.k asc;`
       

     result1 = await pool.query(sql);

    //console.log(result1.rows)

 }


 // 在数据库：两表做M4，对M4相加
 async function Case3(table1, table2, width, symbol){
    console.log('Case3')

    let sql = `select count(*) as c from ${table1}`
    let result1 = await pool.query(sql);
    
    let num = result1.rows[0].c
    

    let PARTITION = num/width

    sql = `
        select s1.k
			,s1.start_t
			,s1.start_t_v
			,s1.end_t
			,s1.end_t_v
			,s1.min_v
			,s1.max_v
			,s2.k
			,s2.start_t
			,s2.start_t_v
			,s2.end_t
			,s2.end_t_v
			,s2.min_v
			,s2.max_v	
			,(s1.min_v+s2.min_v) as min_v,
			 (s1.max_v+s2.max_v) as max_v 
        from ( 
			select a.k as k 
						,min(a.t) as start_t 
						,max(case when a.rn = 1 then a.v end) as start_t_v 
						,max(a.t) as end_t 
						,max(case when a.rn_desc = 1 then a.v end) as end_t_v 
						,min(a.v) as min_v 
						,max(a.v) as max_v from (select round(t/${PARTITION}) as k 
						,t as t 
						,v as v 
						,row_number() over (partition by round(t/${PARTITION}) order by t ) as rn 
						,row_number() over (partition by round(t/${PARTITION}) order by t desc) as rn_desc 
			from ${table1} ) a 
			group by a.k 
		) s1 
		join ( 
					select b.k as k 
								,min(b.t) as start_t 
								,max(case when b.rn = 1 then b.v end) as start_t_v 
								,max(b.t) as end_t 
								,max(case when b.rn_desc = 1 then b.v end) as end_t_v 
								,min(b.v) as min_v 
								,max(b.v) as max_v from (select round(t/${PARTITION}) as k 
								,t as t 
								,v as v 
								,row_number() over (partition by round(t/${PARTITION}) order by t ) as rn 
								,row_number() over (partition by round(t/${PARTITION}) order by t desc) as rn_desc 
					from ${table2} ) b 
					group by b.k 
					) s2 on s1.k=s2.k 
        order by s1.k asc
    `
       

     result1 = await pool.query(sql);

    //console.log(result1.rows)

 }



 async function avgCase1(table1, width, intervalRange) {
    console.log('avgCase1');
    let t3 = [];


    // 查询表数据
    let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1} ORDER BY t ASC`;
    let result1 = await pool.query(sql);

    const length = result1.rows.length;

    console.log(`Fetched ${length} rows from ${table1}`);
    console.log(`Chunk size (IntervalRange parameter): ${intervalRange}`);
    result1.rows.forEach(e => {
        e.v = parseFloat(e.v);
    })
    // result1.rows.forEach(e =>{
    //     console.log(e)
    // })

    if (intervalRange <= 0) {
        console.error("Error: 'intervalRange' parameter should be greater than 0.");
        return { data: t3 };
    }
    let sum = 0
    let avgV = 0
    
    for (let i = 0; i < length; i++) {
        let chunkIndex = Math.floor(i / intervalRange); // 计算当前数据点属于哪个chunk
        let chunkStartIndex = chunkIndex * intervalRange; // 当前chunk的起始索引
        let chunkEndIndex = Math.min(chunkStartIndex + intervalRange -1, length-1); // 当前chunk的结束索引
        
        //console.log('start:',chunkStartIndex, '  end:',chunkEndIndex)
        if(i == chunkStartIndex){
            sum = 0
            for(let j=chunkStartIndex;j<= chunkEndIndex;j++){
                sum += parseFloat(result1.rows[j].v)
            }
            avgV = sum/(chunkEndIndex-chunkStartIndex+1)
        }
        // // 当前chunk的所有数据
        // let chunk = result1.rows.slice(chunkStartIndex, chunkEndIndex);

        // // 计算当前chunk的平均v值
        // let avgV = chunk.reduce((sum, row) => sum + row.v, 0) / chunk.length;

        // 将每个数据点的t和计算好的avgV添加到结果数组中
        
        t3.push({ t: result1.rows[i].t, v: avgV });

        //console.log('i:',i, '  v:', avgV)
    }
    // console.log(t3);

    let num = t3.length

    let res = computeM4TimeSE(width, [0, num - 1])
    let globalStartTime = t3[0].t;
    let globalEndTime = t3[num - 1].t;
    res.forEach(e => {
        let min = Infinity;
        let max = -Infinity;
        let { s: frontTime, e: lastTime } = getFrontMidLast(globalStartTime, globalEndTime, e.start_time, e.end_time, intervalRange);
        //console.log(frontTime);
        if (frontTime == null) {
            frontTime = e.start_time + intervalRange-1;
        }
        if (lastTime == null) {
            lastTime = e.end_time - intervalRange+1;
        }


        for (let i = frontTime ; i <= lastTime ; i++) {
            // console.log(t3[i].v)
            if (t3[i].v < min) {
                min = t3[i].v
            }

            if (t3[i].v > max) {
                max = t3[i].v
            }
        }



        e.min = min
        e.max = max
        e.st_v = t3[e.start_time].v
        e.et_v = t3[e.end_time].v

        if(frontTime + 1 > lastTime - 1){
            e.min = Math.min(e.st_v,e.et_v)
            e.max = Math.max(e.st_v,e.et_v)
        }
    })

    outputM4(res)

    return res
}




function testTime(length) {

    length = 100000000

    console.time('赋值');
    arr2 = new Array(length);
    for (let i = 0; i < length; i++) {
        arr2[i] = i;
    }
    console.timeEnd('赋值');



    console.time('添加');

    arr1 = [];
    for (let i = 0; i < length; i++) {
        arr1.push(i);
    }

    console.timeEnd('添加');
}



