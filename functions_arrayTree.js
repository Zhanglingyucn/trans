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

        //存储树的最底层次的外围节点。
        this.bottonLevelDLL = new DLL()
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
            //Node完全在M4的左边；
            case node.eTime < m4.start_time:
                return 1;break;

            //Node右边界与M4左边界重合
            case node.eTime == m4.start_time:
                return 2;break;

            //Node跨过M4左边界；
            case node.sTime < m4.start_time  && node.eTime > m4.start_time :
                return 3;break;

            //Node左边界与M4左边界重合；
            case node.sTime == m4.start_time /* && node.eTime < m4.end_time */:
                return 4; break;

            //Node在M4内部；
            case node.sTime > m4.start_time && node.eTime < m4.end_time:
                return 5; break;

            //Node右边界与M4右边界重合
            case /* node.sTime > m4.start_time && */ node.eTime == m4.end_time:
                return 6; break;

            //Node跨过M4右边界；
            case /* node.sTime > m4.start_time &&*/ node.eTime > m4.end_time && node.sTime < m4.end_time:
                return 7; break;

            //Node左边界与M4右边界重合
            case node.sTime == m4.end_time:
                return 8; break;

            //Node完全在M4的右边；
            case node.sTime > m4.end_time:
                return 9; break;
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

        // 当前M4开始，是初始开始+平均每个桶分的点数，向上取整
        res[i].start_time=globalStart + Math.ceil( i * everyNum)

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



    let { StartIndex, EndIndex } = getTreeLastSE(segmentTree, width);
    let computeArrayIndex = [];
    for(let a = StartIndex;a<=EndIndex;a++){
        computeArrayIndex.push(a)
    }
    segmentTree.bottonLevelDLL.constructFromList(computeArrayIndex)
    //segmentTree.maxDLL.constructFromList(computeArrayIndex)


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

    timestart('getTableBFromDB');
    //let table_b = await getTableBFromCache(segmentTree,indexArray)
    let table_b = await getTableBFromDB(segmentTree,indexset)
    timeend('getTableBFromDB');


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
   


    //上面计算，将要计算的节点currentComputingNodeMax的孩子存储在needQueryIndex中，从数据库查询并计算
    await  Multi_Query(needQueryIndex,[], segmentTrees)

    
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


    getOwn(index){
        return this.nodes[index];
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

    let realDataRowNum = getRealDataRowNum(segmentTrees[0], segmentTrees[0])

    if(isNaN(screenStart)){
        screenStart = 0
    }
    if(isNaN(screenEnd)){
        screenEnd = realDataRowNum-1
    }

    console.log(screenStart, screenEnd)



    //构建M4数组，width个M4元素。
    //realDataRowNum = 63
    //to repair经测试，待修改。
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


    console.log('totlaNodes:',Object.keys(segmentTrees[0].nodes).length)

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


    let needQuerysIndex = []


    let cuttentNode = segmentTrees[0].bottonLevelDLL.getOwn(StartIndex)

    if(cuttentNode == null){
        //error
    }

    //let node = segmentTrees[0].nodes[cuttentNode.ownIndex]


    while(i < M4_array.length && cuttentNode!=null){

        let node = new SegmentTreeNode()
        let { sTime: sTime1, eTime: eTime1 } = getSETimeByIndex(segmentTrees[0], cuttentNode.ownIndex);
        node.sTime = sTime1
        node.eTime = eTime1
        node.index = cuttentNode.ownIndex
        
        let m4 = M4_array[i]
        let type = isContain(node, m4);


        //对叶子结点
        if(type == -1){
            cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            continue;
        }

        //叶子Node与M4左边界重合，该节点的值（因为是叶子节点，所以min=max）赋给该M4的左边界st_v
        if(type == -2){
            m4.stNodeIndex=node.index   
            cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            continue;
        }

        //叶子Node在M4内部，放到该M4的inner中
        if (type == -3) {
            m4.innerNodes.push(node.index)
            cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            continue;
        }

        //叶子Node与M4右边界重合，该节点的值（因为是叶子节点，所以min=max）赋给该M4的右边界et_v
        if (type == -4) {
            m4.etNodeIndex = node.index
            cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            continue;
        }
        if(type == -5){
            i++
            continue;
        }





        if(type == 1){
            cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            continue;
        }

        //要进行分裂
        if(type == 2 || type == 3 || type == 4 || type == 6 || type == 7 || type == 8){
            let { leftIndex, rightIndex } = getChildrenIndex(node.index);
            if(func.funName == 'avg_w'){
                segmentTrees[0].minDLL.parentToChildren(node.index,leftIndex, rightIndex)
                segmentTrees[0].maxDLL.parentToChildren(node.index,leftIndex, rightIndex)
            }


            // let leftChild = new SegmentTreeNode()
            // let { sTime:sTime1, eTime:eTime1 } = getSETimeByIndex(segmentTrees[0], leftIndex);
            // leftChild.sTime = sTime1
            // leftChild.eTime = eTime1
            // leftChild.index = leftIndex

            // let rightChild = new SegmentTreeNode()
            // let { sTime:sTime2, eTime:eTime2 } = getSETimeByIndex(segmentTrees[0], rightIndex);
            // rightChild.sTime = sTime2
            // rightChild.eTime = eTime2
            // rightChild.index = rightIndex

            //保存向下分裂后需要查询的index,先把当前分裂的左右孩子放进去
            needQuerysIndex.push(leftIndex)
            needQuerysIndex.push(rightIndex)


            segmentTrees[0].bottonLevelDLL.parentToChildren(node.index,leftIndex, rightIndex)
            cuttentNode = segmentTrees[0].bottonLevelDLL.getOwn(leftIndex)

            continue;
        }




        // 对非叶子节点，如果该node完全包含在M4内部，则不需要分裂，而是仅仅将该node加入到M4的innerNodes中即可。
        if(type == 5){
            //注意一下，对这种innerNodes的处理，在division外部已经处理了，看一下是否会处理重复。
            m4.innerNodes.push(node.index)

            cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            continue;
        }

        if (type === 9) {
            i++;
            continue;
        }

    }

    //对computeArrayUnqueryIndex进行查询，并加到computeArray中。
    let tempArrayIndex = await Multi_Query(needQuerysIndex, leaves, segmentTrees);
}


async function fenlie_old(StartIndex, M4_array, EndIndex, segmentTrees, func, leaves) {
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
            await test();break
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



async function testFunc(table1, width, extremes,screenStart, screenEnd){
    let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1}  where t>=${screenStart} and t<= ${screenEnd} order by t asc `
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
   
       let res = computeM4TimeSE(width, [screenStart, screenEnd])
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
 async function Case1(table1, table2, width, symbol ,extremes,screenStart,screenEnd){
    console.log('Case1')


    if(symbol == 'avg'){
        await avgCase1(table1, width, extremes[0],screenStart,screenEnd)

        return 
    }

    if(symbol == 'avg_w'){
        await wAvgCase1(table1, width, extremes,screenStart,screenEnd)

        return 
    }

    if(symbol == 'testFunc'){
        await testFunc(table1, width, extremes,screenStart,screenEnd)

        return 
    }


    let result1,result2

    if(isNaN(screenStart) || isNaN(screenEnd)){
        let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1} order by t asc `
         result1 = await pool.query(sql);
        sql = `SELECT ${table2}.t AS t, ${table2}.v AS v FROM ${table2} order by t asc`
         result2 = await pool.query(sql);
    }else {
        let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1} where t>=${screenStart} and t<= ${screenEnd} order by t asc `
         result1 = await pool.query(sql);
        sql = `SELECT ${table2}.t AS t, ${table2}.v AS v FROM ${table2}  where t>=${screenStart} and t<= ${screenEnd} order by t asc`
         result2 = await pool.query(sql);
    }


    screenStart = result1.rows[0].t
    screenEnd = result1.rows[result2.rows.length-1].t

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

    let res = computeM4TimeSE(width, [screenStart, screenEnd])
    // let min_arr = []
    // let max_arr = []
    res.forEach(e =>{
        let min = Infinity;
        let max = -Infinity;
        for(let i = e.start_time-screenStart; i <= e.end_time-screenStart; i++){

            if(t3[i].v < min){
                min = t3[i].v
            }

            if(t3[i].v > max){
                max = t3[i].v
            }
        }
        e.min = min
        e.max = max
        e.st_v = t3[e.start_time-screenStart].v
        e.et_v = t3[e.end_time-screenStart].v
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

    // console.log('lingyu zhang's implementation')
    // let PARTITION = num/width
    // sql = `select a.k 
	// 		,min(a.t) as start_t 
	// 		,max(case when a.rn = 1 then a.v end) as start_t_v 
	// 		,max(a.t) as end_t 
	// 		,max(case when a.rn_desc = 1 then a.v end) as end_t_v 
	// 		,min(a.v) as min_v 
	// 		,max(a.v) as max_v 
    //     from 
	// 	(
	// 		select round(t1/${PARTITION}) as k 
	// 					,t1 as t 
	// 					,v1 as v 
	// 					,row_number() over (partition by round(t1/${PARTITION}) order by t1 ) as rn 
	// 					,row_number() over (partition by round(t1/${PARTITION}) order by t1 desc) as rn_desc 
	// 		from 
	// 			( select ${table1}.t as t1
	// 						,${table1}.v as v1
	// 						,${table2}.t as t2
	// 						,${table2}.v as v2
	// 						,(${table1}.v+${table2}.v) as v3 
	// 				from ${table1} join ${table2} on ${table1}.t=${table2}.t 
	// 				) as b 
	// 	) a 
					
    //     group by a.k order by a.k asc;`

    console.log('original M4 implementation')
    let t_start = 0, t_end = num-1;
    sql = `WITH Q AS (select ${table1}.t as t,
							 (${table1}.v${symbol}${table2}.v) AS v 
					    from ${table1} join ${table2} on ${table1}.t=${table2}.t
            )
            SELECT t,v FROM Q JOIN
                (SELECT round(${width}*(t-${t_start})::bigint / (${t_end}-${t_start}+1)) AS k,
                       min(v) AS v_min, max(v) AS v_max,
                       min(t) AS t_min, max(t) AS t_max
                 FROM Q GROUP BY k) AS QA
            ON k = round(${width}*(t-${t_start})::bigint / (${t_end}-${t_start}+1))
                AND (v = v_min OR v = v_max OR
                    t = t_min OR t = t_max)`
       

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



async function test(){

    const numbers = [5, 2, 9, 1, 5, 6];
const min = Math.min(...numbers);
console.log(min); // 输出：1

for(let i=0;i<1000;i++){

    await testTime(1)
}

for(let key in stats.callCounts){
    timetotal(key)
}

}


async function testTime(length) {

    length = 100000000
    let sql1,sql2,r1,r2

// timestart('nomerge');
// let sql1 = 'SELECT i, minvd, maxvd FROM mock3_om3 where i in (1024, 1025, 1027, 1029, 1030, 1032, 1034, 1035, 1037, 1039, 1041, 1042, 1044, 1046, 1047, 1049, 1051, 1053, 1054, 1056, 1058, 1059, 1061, 1063, 1064, 1066, 1068, 1070, 1071, 1073, 1075, 1076, 1078, 1080, 1082, 1083, 1085, 1087, 1088, 1090, 1092, 1093, 1095, 1097, 1099, 1100, 1102, 1104, 1105, 1107, 1109, 1111, 1112, 1114, 1116, 1117, 1119, 1121, 1122, 1124, 1126, 1128, 1129, 1131, 1133, 1134, 1136, 1138, 1140, 1141, 1143, 1145, 1146, 1148, 1150, 1151, 1152, 1153, 1155, 1157, 1158, 1160, 1162, 1163, 1165, 1167, 1169, 1170, 1172, 1174, 1175, 1177, 1179, 1181, 1182, 1184, 1186, 1187, 1189, 1191, 1192, 1194, 1196, 1198, 1199, 1201, 1203, 1204, 1206, 1208, 1210, 1211, 1213, 1215, 1216, 1218, 1220, 1221, 1223, 1225, 1227, 1228, 1230, 1232, 1233, 1235, 1237, 1239, 1240, 1242, 1244, 1245, 1247, 1249, 1250, 1252, 1254, 1256, 1257, 1259, 1261, 1262, 1264, 1266, 1268, 1269, 1271, 1273, 1274, 1276, 1278, 1279, 1280, 1281, 1283, 1285, 1286, 1288, 1290, 1291, 1293, 1295, 1297, 1298, 1300, 1302, 1303, 1305, 1307, 1309, 1310, 1312, 1314, 1315, 1317, 1319, 1320, 1322, 1324, 1326, 1327, 1329, 1331, 1332, 1334, 1336, 1338, 1339, 1341, 1343, 1344, 1346, 1348, 1349, 1351, 1353, 1355, 1356, 1358, 1360, 1361, 1363, 1365, 1367, 1368, 1370, 1372, 1373, 1375, 1377, 1378, 1380, 1382, 1384, 1385, 1387, 1389, 1390, 1392, 1394, 1396, 1397, 1399, 1401, 1402, 1404, 1406, 1407, 1408, 1409, 1411, 1413, 1414, 1416, 1418, 1419, 1421, 1423, 1425, 1426, 1428, 1430, 1431, 1433, 1435, 1437, 1438, 1440, 1442, 1443, 1445, 1447, 1448, 1450, 1452, 1454, 1455, 1457, 1459, 1460, 1462, 1464, 1466, 1467, 1469, 1471, 1472, 1474, 1476, 1477, 1479, 1481, 1483, 1484, 1486, 1488, 1489, 1491, 1493, 1495, 1496, 1498, 1500, 1501, 1503, 1505, 1506, 1508, 1510, 1512, 1513, 1515, 1517, 1518, 1520, 1522, 1524, 1525, 1527, 1529, 1530, 1532, 1534, 1535, 1536, 1537, 1539, 1541, 1542, 1544, 1546, 1547, 1549, 1551, 1553, 1554, 1556, 1558, 1559, 1561, 1563, 1565, 1566, 1568, 1570, 1571, 1573, 1575, 1576, 1578, 1580, 1582, 1583, 1585, 1587, 1588, 1590, 1592, 1594, 1595, 1597, 1599, 1600, 1602, 1604, 1605, 1607, 1609, 1611, 1612, 1614, 1616, 1617, 1619, 1621, 1623, 1624, 1626, 1628, 1629, 1631, 1633, 1634, 1636, 1638, 1640, 1641, 1643, 1645, 1646, 1648, 1650, 1652, 1653, 1655, 1657, 1658, 1660, 1662, 1663, 1664, 1665, 1667, 1669, 1670, 1672, 1674, 1675, 1677, 1679, 1681, 1682, 1684, 1686, 1687, 1689, 1691, 1693, 1694, 1696, 1698, 1699, 1701, 1703, 1704, 1706, 1708, 1710, 1711, 1713, 1715, 1716, 1718, 1720, 1722, 1723, 1725, 1727, 1728, 1730, 1732, 1733, 1735, 1737, 1739, 1740, 1742, 1744, 1745, 1747, 1749, 1751, 1752, 1754, 1756, 1757, 1759, 1761, 1762, 1764, 1766, 1768, 1769, 1771, 1773, 1774, 1776, 1778, 1780, 1781, 1783, 1785, 1786, 1788, 1790, 1791, 1792, 1793, 1795, 1797, 1798, 1800, 1802, 1803, 1805, 1807, 1809, 1810, 1812, 1814, 1815, 1817, 1819, 1821, 1822, 1824, 1826, 1827, 1829, 1831, 1832, 1834, 1836, 1838, 1839, 1841, 1843, 1844, 1846, 1848, 1850, 1851, 1853, 1855, 1856, 1858, 1860, 1861, 1863, 1865, 1867, 1868, 1870, 1872, 1873, 1875, 1877, 1879, 1880, 1882, 1884, 1885, 1887, 1889, 1890, 1892, 1894, 1896, 1897, 1899, 1901, 1902, 1904, 1906, 1908, 1909, 1911, 1913, 1914, 1916, 1918, 1920, 1921, 1923, 1925, 1926, 1928, 1930, 1931, 1933, 1935, 1937, 1938, 1940, 1942, 1943, 1945, 1947, 1949, 1950, 1952, 1954, 1955, 1957, 1959, 1960, 1962, 1964, 1966, 1967, 1969, 1971, 1972, 1974, 1976, 1978, 1979, 1981, 1983, 1984, 1986, 1988, 1989, 1991, 1993, 1995, 1996, 1998, 2000, 2001, 2003, 2005, 2007, 2008, 2010, 2012, 2013, 2015, 2017, 2018, 2020, 2022, 2024, 2025, 2027, 2029, 2030, 2032, 2034, 2036, 2037, 2039, 2041, 2042, 2044, 2046, 2047, 2048, 2051, 2054, 2058, 2061, 2065, 2068, 2071, 2075, 2078, 2082, 2085, 2088, 2092, 2095, 2099, 2102, 2106, 2109, 2112, 2116, 2119, 2123, 2126, 2129, 2133, 2136, 2140, 2143, 2146, 2150, 2153, 2157, 2160, 2164, 2167, 2170, 2174, 2177, 2181, 2184, 2187, 2191, 2194, 2198, 2201, 2205, 2208, 2211, 2215, 2218, 2222, 2225, 2228, 2232, 2235, 2239, 2242, 2245, 2249, 2252, 2256, 2259, 2263, 2266, 2269, 2273, 2276, 2280, 2283, 2286, 2290, 2293, 2297, 2300, 2303, 2304, 2307, 2310, 2314, 2317, 2321, 2324, 2327, 2331, 2334, 2338, 2341, 2344, 2348, 2351, 2355, 2358, 2362, 2365, 2368, 2372, 2375, 2379, 2382, 2385, 2389, 2392, 2396, 2399, 2402, 2406, 2409, 2413, 2416, 2420, 2423, 2426, 2430, 2433, 2437, 2440, 2443, 2447, 2450, 2454, 2457, 2461, 2464, 2467, 2471, 2474, 2478, 2481, 2484, 2488, 2491, 2495, 2498, 2501, 2505, 2508, 2512, 2515, 2519, 2522, 2525, 2529, 2532, 2536, 2539, 2542, 2546, 2549, 2553, 2556, 2559, 2560, 2563, 2566, 2570, 2573, 2577, 2580, 2583, 2587, 2590, 2594, 2597, 2600, 2604, 2607, 2611, 2614, 2618, 2621, 2624, 2628, 2631, 2635, 2638, 2641, 2645, 2648, 2652, 2655, 2658, 2662, 2665, 2669, 2672, 2676, 2679, 2682, 2686, 2689, 2693, 2696, 2699, 2703, 2706, 2710, 2713, 2717, 2720, 2723, 2727, 2730, 2734, 2737, 2740, 2744, 2747, 2751, 2754, 2757, 2761, 2764, 2768, 2771, 2775, 2778, 2781, 2785, 2788, 2792, 2795, 2798, 2802, 2805, 2809, 2812, 2815, 2816, 2819, 2822, 2826, 2829, 2833, 2836, 2839, 2843, 2846, 2850, 2853, 2856, 2860, 2863, 2867, 2870, 2874, 2877, 2880, 2884, 2887, 2891, 2894, 2897, 2901, 2904, 2908, 2911, 2914, 2918, 2921, 2925, 2928, 2932, 2935, 2938, 2942, 2945, 2949, 2952, 2955, 2959, 2962, 2966, 2969, 2973, 2976, 2979, 2983, 2986, 2990, 2993, 2996, 3000, 3003, 3007, 3010, 3013, 3017, 3020, 3024, 3027, 3031, 3034, 3037, 3041, 3044, 3048, 3051, 3054, 3058, 3061, 3065, 3068, 3071, 3072, 3075, 3078, 3082, 3085, 3089, 3092, 3095, 3099, 3102, 3106, 3109, 3112, 3116, 3119, 3123, 3126, 3130, 3133, 3136, 3140, 3143, 3147, 3150, 3153, 3157, 3160, 3164, 3167, 3170, 3174, 3177, 3181, 3184, 3188, 3191, 3194, 3198, 3201, 3205, 3208, 3211, 3215, 3218, 3222, 3225, 3229, 3232, 3235, 3239, 3242, 3246, 3249, 3252, 3256, 3259, 3263, 3266, 3269, 3273, 3276, 3280, 3283, 3287, 3290, 3293, 3297, 3300, 3304, 3307, 3310, 3314, 3317, 3321, 3324, 3327, 3328, 3331, 3334, 3338, 3341, 3345, 3348, 3351, 3355, 3358, 3362, 3365, 3368, 3372, 3375, 3379, 3382, 3386, 3389, 3392, 3396, 3399, 3403, 3406, 3409, 3413, 3416, 3420, 3423, 3426, 3430, 3433, 3437, 3440, 3444, 3447, 3450, 3454, 3457, 3461, 3464, 3467, 3471, 3474, 3478, 3481, 3485, 3488, 3491, 3495, 3498, 3502, 3505, 3508, 3512, 3515, 3519, 3522, 3525, 3529, 3532, 3536, 3539, 3543, 3546, 3549, 3553, 3556, 3560, 3563, 3566, 3570, 3573, 3577, 3580, 3583, 3584, 3587, 3590, 3594, 3597, 3601, 3604, 3607, 3611, 3614, 3618, 3621, 3624, 3628, 3631, 3635, 3638, 3642, 3645, 3648, 3652, 3655, 3659, 3662, 3665, 3669, 3672, 3676, 3679, 3682, 3686, 3689, 3693, 3696, 3700, 3703, 3706, 3710, 3713, 3717, 3720, 3723, 3727, 3730, 3734, 3737, 3741, 3744, 3747, 3751, 3754, 3758, 3761, 3764, 3768, 3771, 3775, 3778, 3781, 3785, 3788, 3792, 3795, 3799, 3802, 3805, 3809, 3812, 3816, 3819, 3822, 3826, 3829, 3833, 3836, 3840, 3843, 3846, 3850, 3853, 3857, 3860, 3863, 3867, 3870, 3874, 3877, 3880, 3884, 3887, 3891, 3894, 3898, 3901, 3904, 3908, 3911, 3915, 3918, 3921, 3925, 3928, 3932, 3935, 3938, 3942, 3945, 3949, 3952, 3956, 3959, 3962, 3966, 3969, 3973, 3976, 3979, 3983, 3986, 3990, 3993, 3997, 4000, 4003, 4007, 4010, 4014, 4017, 4020, 4024, 4027, 4031, 4034, 4037, 4041, 4044, 4048, 4051, 4055, 4058, 4061, 4065, 4068, 4072, 4075, 4078, 4082, 4085, 4089, 4092, 4095, 4096, 4102, 4109, 4116, 4123, 4130, 4136, 4143, 4150, 4157, 4164, 4171, 4177, 4184, 4191, 4198, 4205, 4212, 4218, 4225, 4232, 4239, 4246, 4253, 4259, 4266, 4273, 4280, 4287, 4293, 4300, 4307, 4314, 4321, 4328, 4334, 4341, 4348, 4355, 4362, 4369, 4375, 4382, 4389, 4396, 4403, 4410, 4416, 4423, 4430, 4437, 4444, 4450, 4457, 4464, 4471, 4478, 4485, 4491, 4498, 4505, 4512, 4519, 4526, 4532, 4539, 4546, 4553, 4560, 4567, 4573, 4580, 4587, 4594, 4601, 4607, 4608, 4614, 4621, 4628, 4635, 4642, 4648, 4655, 4662, 4669, 4676, 4683, 4689, 4696, 4703, 4710, 4717, 4724, 4730, 4737, 4744, 4751, 4758, 4765, 4771, 4778, 4785, 4792, 4799, 4805, 4812, 4819, 4826, 4833, 4840, 4846, 4853, 4860, 4867, 4874, 4881, 4887, 4894, 4901, 4908, 4915, 4922, 4928, 4935, 4942, 4949, 4956, 4962, 4969, 4976, 4983, 4990, 4997, 5003, 5010, 5017, 5024, 5031, 5038, 5044, 5051, 5058, 5065, 5072, 5079, 5085, 5092, 5099, 5106, 5113, 5119, 5120, 5126, 5133, 5140, 5147, 5154, 5160, 5167, 5174, 5181, 5188, 5195, 5201, 5208, 5215, 5222, 5229, 5236, 5242, 5249, 5256, 5263, 5270, 5277, 5283, 5290, 5297, 5304, 5311, 5317, 5324, 5331, 5338, 5345, 5352, 5358, 5365, 5372, 5379, 5386, 5393, 5399, 5406, 5413, 5420, 5427, 5434, 5440, 5447, 5454, 5461, 5468, 5474, 5481, 5488, 5495, 5502, 5509, 5515, 5522, 5529, 5536, 5543, 5550, 5556, 5563, 5570, 5577, 5584, 5591, 5597, 5604, 5611, 5618, 5625, 5631, 5632, 5638, 5645, 5652, 5659, 5666, 5672, 5679, 5686, 5693, 5700, 5707, 5713, 5720, 5727, 5734, 5741, 5748, 5754, 5761, 5768, 5775, 5782, 5789, 5795, 5802, 5809, 5816, 5823, 5829, 5836, 5843, 5850, 5857, 5864, 5870, 5877, 5884, 5891, 5898, 5905, 5911, 5918, 5925, 5932, 5939, 5946, 5952, 5959, 5966, 5973, 5980, 5986, 5993, 6000, 6007, 6014, 6021, 6027, 6034, 6041, 6048, 6055, 6062, 6068, 6075, 6082, 6089, 6096, 6103, 6109, 6116, 6123, 6130, 6137, 6143, 6144, 6150, 6157, 6164, 6171, 6178, 6184, 6191, 6198, 6205, 6212, 6219, 6225, 6232, 6239, 6246, 6253, 6260, 6266, 6273, 6280, 6287, 6294, 6301, 6307, 6314, 6321, 6328, 6335, 6341, 6348, 6355, 6362, 6369, 6376, 6382, 6389, 6396, 6403, 6410, 6417, 6423, 6430, 6437, 6444, 6451, 6458, 6464, 6471, 6478, 6485, 6492, 6498, 6505, 6512, 6519, 6526, 6533, 6539, 6546, 6553, 6560, 6567, 6574, 6580, 6587, 6594, 6601, 6608, 6615, 6621, 6628, 6635, 6642, 6649, 6655, 6656, 6662, 6669, 6676, 6683, 6690, 6696, 6703, 6710, 6717, 6724, 6731, 6737, 6744, 6751, 6758, 6765, 6772, 6778, 6785, 6792, 6799, 6806, 6813, 6819, 6826, 6833, 6840, 6847, 6853, 6860, 6867, 6874, 6881, 6888, 6894, 6901, 6908, 6915, 6922, 6929, 6935, 6942, 6949, 6956, 6963, 6970, 6976, 6983, 6990, 6997, 7004, 7010, 7017, 7024, 7031, 7038, 7045, 7051, 7058, 7065, 7072, 7079, 7086, 7092, 7099, 7106, 7113, 7120, 7127, 7133, 7140, 7147, 7154, 7161, 7167, 7168, 7174, 7181, 7188, 7195, 7202, 7208, 7215, 7222, 7229, 7236, 7243, 7249, 7256, 7263, 7270, 7277, 7284, 7290, 7297, 7304, 7311, 7318, 7325, 7331, 7338, 7345, 7352, 7359, 7365, 7372, 7379, 7386, 7393, 7400, 7406, 7413, 7420, 7427, 7434, 7441, 7447, 7454, 7461, 7468, 7475, 7482, 7488, 7495, 7502, 7509, 7516, 7522, 7529, 7536, 7543, 7550, 7557, 7563, 7570, 7577, 7584, 7591, 7598, 7604, 7611, 7618, 7625, 7632, 7639, 7645, 7652, 7659, 7666, 7673, 7680, 7686, 7693, 7700, 7707, 7714, 7720, 7727, 7734, 7741, 7748, 7755, 7761, 7768, 7775, 7782, 7789, 7796, 7802, 7809, 7816, 7823, 7830, 7837, 7843, 7850, 7857, 7864, 7871, 7877, 7884, 7891, 7898, 7905, 7912, 7918, 7925, 7932, 7939, 7946, 7953, 7959, 7966, 7973, 7980, 7987, 7994, 8000, 8007, 8014, 8021, 8028, 8034, 8041, 8048, 8055, 8062, 8069, 8075, 8082, 8089, 8096, 8103, 8110, 8116, 8123, 8130, 8137, 8144, 8151, 8157, 8164, 8171, 8178, 8185, 8191, 8192, 8205, 8219, 8232, 8246, 8260, 8273, 8287, 8301, 8314, 8328, 8342, 8355, 8369, 8383, 8396, 8410, 8424, 8437, 8451, 8465, 8478, 8492, 8506, 8519, 8533, 8546, 8560, 8574, 8587, 8601, 8615, 8628, 8642, 8656, 8669, 8683, 8697, 8710, 8724, 8738, 8751, 8765, 8779, 8792, 8806, 8820, 8833, 8847, 8861, 8874, 8888, 8901, 8915, 8929, 8942, 8956, 8970, 8983, 8997, 9011, 9024, 9038, 9052, 9065, 9079, 9093, 9106, 9120, 9134, 9147, 9161, 9175, 9188, 9202, 9215, 9216, 9229, 9243, 9256, 9270, 9284, 9297, 9311, 9325, 9338, 9352, 9366, 9379, 9393, 9407, 9420, 9434, 9448, 9461, 9475, 9489, 9502, 9516, 9530, 9543, 9557, 9570, 9584, 9598, 9611, 9625, 9639, 9652, 9666, 9680, 9693, 9707, 9721, 9734, 9748, 9762, 9775, 9789, 9803, 9816, 9830, 9844, 9857, 9871, 9885, 9898, 9912, 9925, 9939, 9953, 9966, 9980, 9994, 10007, 10021, 10035, 10048, 10062, 10076, 10089, 10103, 10117, 10130, 10144, 10158, 10171, 10185, 10199, 10212, 10226, 10239, 10240, 10253, 10267, 10280, 10294, 10308, 10321, 10335, 10349, 10362, 10376, 10390, 10403, 10417, 10431, 10444, 10458, 10472, 10485, 10499, 10513, 10526, 10540, 10554, 10567, 10581, 10594, 10608, 10622, 10635, 10649, 10663, 10676, 10690, 10704, 10717, 10731, 10745, 10758, 10772, 10786, 10799, 10813, 10827, 10840, 10854, 10868, 10881, 10895, 10909, 10922, 10936, 10949, 10963, 10977, 10990, 11004, 11018, 11031, 11045, 11059, 11072, 11086, 11100, 11113, 11127, 11141, 11154, 11168, 11182, 11195, 11209, 11223, 11236, 11250, 11263, 11264, 11277, 11291, 11304, 11318, 11332, 11345, 11359, 11373, 11386, 11400, 11414, 11427, 11441, 11455, 11468, 11482, 11496, 11509, 11523, 11537, 11550, 11564, 11578, 11591, 11605, 11618, 11632, 11646, 11659, 11673, 11687, 11700, 11714, 11728, 11741, 11755, 11769, 11782, 11796, 11810, 11823, 11837, 11851, 11864, 11878, 11892, 11905, 11919, 11933, 11946, 11960, 11973, 11987, 12001, 12014, 12028, 12042, 12055, 12069, 12083, 12096, 12110, 12124, 12137, 12151, 12165, 12178, 12192, 12206, 12219, 12233, 12247, 12260, 12274, 12287, 12288, 12301, 12315, 12328, 12342, 12356, 12369, 12383, 12397, 12410, 12424, 12438, 12451, 12465, 12479, 12492, 12506, 12520, 12533, 12547, 12561, 12574, 12588, 12602, 12615, 12629, 12642, 12656, 12670, 12683, 12697, 12711, 12724, 12738, 12752, 12765, 12779, 12793, 12806, 12820, 12834, 12847, 12861, 12875, 12888, 12902, 12916, 12929, 12943, 12957, 12970, 12984, 12997, 13011, 13025, 13038, 13052, 13066, 13079, 13093, 13107, 13120, 13134, 13148, 13161, 13175, 13189, 13202, 13216, 13230, 13243, 13257, 13271, 13284, 13298, 13311, 13312, 13325, 13339, 13352, 13366, 13380, 13393, 13407, 13421, 13434, 13448, 13462, 13475, 13489, 13503, 13516, 13530, 13544, 13557, 13571, 13585, 13598, 13612, 13626, 13639, 13653, 13666, 13680, 13694, 13707, 13721, 13735, 13748, 13762, 13776, 13789, 13803, 13817, 13830, 13844, 13858, 13871, 13885, 13899, 13912, 13926, 13940, 13953, 13967, 13981, 13994, 14008, 14021, 14035, 14049, 14062, 14076, 14090, 14103, 14117, 14131, 14144, 14158, 14172, 14185, 14199, 14213, 14226, 14240, 14254, 14267, 14281, 14295, 14308, 14322, 14335, 14336, 14349, 14363, 14376, 14390, 14404, 14417, 14431, 14445, 14458, 14472, 14486, 14499, 14513, 14527, 14540, 14554, 14568, 14581, 14595, 14609, 14622, 14636, 14650, 14663, 14677, 14690, 14704, 14718, 14731, 14745, 14759, 14772, 14786, 14800, 14813, 14827, 14841, 14854, 14868, 14882, 14895, 14909, 14923, 14936, 14950, 14964, 14977, 14991, 15005, 15018, 15032, 15045, 15059, 15073, 15086, 15100, 15114, 15127, 15141, 15155, 15168, 15182, 15196, 15209, 15223, 15237, 15250, 15264, 15278, 15291, 15305, 15319, 15332, 15346, 15360, 15373, 15387, 15400, 15414, 15428, 15441, 15455, 15469, 15482, 15496, 15510, 15523, 15537, 15551, 15564, 15578, 15592, 15605, 15619, 15633, 15646, 15660, 15674, 15687, 15701, 15714, 15728, 15742, 15755, 15769, 15783, 15796, 15810, 15824, 15837, 15851, 15865, 15878, 15892, 15906, 15919, 15933, 15947, 15960, 15974, 15988, 16001, 16015, 16029, 16042, 16056, 16069, 16083, 16097, 16110, 16124, 16138, 16151, 16165, 16179, 16192, 16206, 16220, 16233, 16247, 16261, 16274, 16288, 16302, 16315, 16329, 16343, 16356, 16370, 16383, 16384, 16411, 16438, 16465, 16493, 16520, 16547, 16575, 16602, 16629, 16657, 16684, 16711, 16738, 16766, 16793, 16820, 16848, 16875, 16902, 16930, 16957, 16984, 17012, 17039, 17066, 17093, 17121, 17148, 17175, 17203, 17230, 17257, 17285, 17312, 17339, 17367, 17394, 17421, 17448, 17476, 17503, 17530, 17558, 17585, 17612, 17640, 17667, 17694, 17722, 17749, 17776, 17803, 17831, 17858, 17885, 17913, 17940, 17967, 17995, 18022, 18049, 18077, 18104, 18131, 18158, 18186, 18213, 18240, 18268, 18295, 18322, 18350, 18377, 18404, 18431, 18432, 18459, 18486, 18513, 18541, 18568, 18595, 18623, 18650, 18677, 18705, 18732, 18759, 18786, 18814, 18841, 18868, 18896, 18923, 18950, 18978, 19005, 19032, 19060, 19087, 19114, 19141, 19169, 19196, 19223, 19251, 19278, 19305, 19333, 19360, 19387, 19415, 19442, 19469, 19496, 19524, 19551, 19578, 19606, 19633, 19660, 19688, 19715, 19742, 19770, 19797, 19824, 19851, 19879, 19906, 19933, 19961, 19988, 20015, 20043, 20070, 20097, 20125, 20152, 20179, 20206, 20234, 20261, 20288, 20316, 20343, 20370, 20398, 20425, 20452, 20479, 20480, 20507, 20534, 20561, 20589, 20616, 20643, 20671, 20698, 20725, 20753, 20780, 20807, 20834, 20862, 20889, 20916, 20944, 20971, 20998, 21026, 21053, 21080, 21108, 21135, 21162, 21189, 21217, 21244, 21271, 21299, 21326, 21353, 21381, 21408, 21435, 21463, 21490, 21517, 21544, 21572, 21599, 21626, 21654, 21681, 21708, 21736, 21763, 21790, 21818, 21845, 21872, 21899, 21927, 21954, 21981, 22009, 22036, 22063, 22091, 22118, 22145, 22173, 22200, 22227, 22254, 22282, 22309, 22336, 22364, 22391, 22418, 22446, 22473, 22500, 22527, 22528, 22555, 22582, 22609, 22637, 22664, 22691, 22719, 22746, 22773, 22801, 22828, 22855, 22882, 22910, 22937, 22964, 22992, 23019, 23046, 23074, 23101, 23128, 23156, 23183, 23210, 23237, 23265, 23292, 23319, 23347, 23374, 23401, 23429, 23456, 23483, 23511, 23538, 23565, 23592, 23620, 23647, 23674, 23702, 23729, 23756, 23784, 23811, 23838, 23866, 23893, 23920, 23947, 23975, 24002, 24029, 24057, 24084, 24111, 24139, 24166, 24193, 24221, 24248, 24275, 24302, 24330, 24357, 24384, 24412, 24439, 24466, 24494, 24521, 24548, 24575, 24576, 24603, 24630, 24657, 24685, 24712, 24739, 24767, 24794, 24821, 24849, 24876, 24903, 24930, 24958, 24985, 25012, 25040, 25067, 25094, 25122, 25149, 25176, 25204, 25231, 25258, 25285, 25313, 25340, 25367, 25395, 25422, 25449, 25477, 25504, 25531, 25559, 25586, 25613, 25640, 25668, 25695, 25722, 25750, 25777, 25804, 25832, 25859, 25886, 25914, 25941, 25968, 25995, 26023, 26050, 26077, 26105, 26132, 26159, 26187, 26214, 26241, 26269, 26296, 26323, 26350, 26378, 26405, 26432, 26460, 26487, 26514, 26542, 26569, 26596, 26623, 26624, 26651, 26678, 26705, 26733, 26760, 26787, 26815, 26842, 26869, 26897, 26924, 26951, 26978, 27006, 27033, 27060, 27088, 27115, 27142, 27170, 27197, 27224, 27252, 27279, 27306, 27333, 27361, 27388, 27415, 27443, 27470, 27497, 27525, 27552, 27579, 27607, 27634, 27661, 27688, 27716, 27743, 27770, 27798, 27825, 27852, 27880, 27907, 27934, 27962, 27989, 28016, 28043, 28071, 28098, 28125, 28153, 28180, 28207, 28235, 28262, 28289, 28317, 28344, 28371, 28398, 28426, 28453, 28480, 28508, 28535, 28562, 28590, 28617, 28644, 28671, 28672, 28699, 28726, 28753, 28781, 28808, 28835, 28863, 28890, 28917, 28945, 28972, 28999, 29026, 29054, 29081, 29108, 29136, 29163, 29190, 29218, 29245, 29272, 29300, 29327, 29354, 29381, 29409, 29436, 29463, 29491, 29518, 29545, 29573, 29600, 29627, 29655, 29682, 29709, 29736, 29764, 29791, 29818, 29846, 29873, 29900, 29928, 29955, 29982, 30010, 30037, 30064, 30091, 30119, 30146, 30173, 30201, 30228, 30255, 30283, 30310, 30337, 30365, 30392, 30419, 30446, 30474, 30501, 30528, 30556, 30583, 30610, 30638, 30665, 30692, 30720, 30747, 30774, 30801, 30829, 30856, 30883, 30911, 30938, 30965, 30993, 31020, 31047, 31074, 31102, 31129, 31156, 31184, 31211, 31238, 31266, 31293, 31320, 31348, 31375, 31402, 31429, 31457, 31484, 31511, 31539, 31566, 31593, 31621, 31648, 31675, 31703, 31730, 31757, 31784, 31812, 31839, 31866, 31894, 31921, 31948, 31976, 32003, 32030, 32058, 32085, 32112, 32139, 32167, 32194, 32221, 32249, 32276, 32303, 32331, 32358, 32385, 32413, 32440, 32467, 32494, 32522, 32549, 32576, 32604, 32631, 32658, 32686, 32713, 32740, 32767, 32768, 32822, 32877, 32931, 32986, 33041, 33095, 33150, 33204, 33259, 33314, 33368, 33423, 33477, 33532, 33587, 33641, 33696, 33751, 33805, 33860, 33914, 33969, 34024, 34078, 34133, 34187, 34242, 34297, 34351, 34406, 34461, 34515, 34570, 34624, 34679, 34734, 34788, 34843, 34897, 34952, 35007, 35061, 35116, 35170, 35225, 35280, 35334, 35389, 35444, 35498, 35553, 35607, 35662, 35717, 35771, 35826, 35880, 35935, 35990, 36044, 36099, 36154, 36208, 36263, 36317, 36372, 36427, 36481, 36536, 36590, 36645, 36700, 36754, 36809, 36863, 36864, 36918, 36973, 37027, 37082, 37137, 37191, 37246, 37300, 37355, 37410, 37464, 37519, 37573, 37628, 37683, 37737, 37792, 37847, 37901, 37956, 38010, 38065, 38120, 38174, 38229, 38283, 38338, 38393, 38447, 38502, 38557, 38611, 38666, 38720, 38775, 38830, 38884, 38939, 38993, 39048, 39103, 39157, 39212, 39266, 39321, 39376, 39430, 39485, 39540, 39594, 39649, 39703, 39758, 39813, 39867, 39922, 39976, 40031, 40086, 40140, 40195, 40250, 40304, 40359, 40413, 40468, 40523, 40577, 40632, 40686, 40741, 40796, 40850, 40905, 40959, 40960, 41014, 41069, 41123, 41178, 41233, 41287, 41342, 41396, 41451, 41506, 41560, 41615, 41669, 41724, 41779, 41833, 41888, 41943, 41997, 42052, 42106, 42161, 42216, 42270, 42325, 42379, 42434, 42489, 42543, 42598, 42653, 42707, 42762, 42816, 42871, 42926, 42980, 43035, 43089, 43144, 43199, 43253, 43308, 43362, 43417, 43472, 43526, 43581, 43636, 43690, 43745, 43799, 43854, 43909, 43963, 44018, 44072, 44127, 44182, 44236, 44291, 44346, 44400, 44455, 44509, 44564, 44619, 44673, 44728, 44782, 44837, 44892, 44946, 45001, 45055, 45056, 45110, 45165, 45219, 45274, 45329, 45383, 45438, 45492, 45547, 45602, 45656, 45711, 45765, 45820, 45875, 45929, 45984, 46039, 46093, 46148, 46202, 46257, 46312, 46366, 46421, 46475, 46530, 46585, 46639, 46694, 46749, 46803, 46858, 46912, 46967, 47022, 47076, 47131, 47185, 47240, 47295, 47349, 47404, 47458, 47513, 47568, 47622, 47677, 47732, 47786, 47841, 47895, 47950, 48005, 48059, 48114, 48168, 48223, 48278, 48332, 48387, 48442, 48496, 48551, 48605, 48660, 48715, 48769, 48824, 48878, 48933, 48988, 49042, 49097, 49151, 49152, 49206, 49261, 49315, 49370, 49425, 49479, 49534, 49588, 49643, 49698, 49752, 49807, 49861, 49916, 49971, 50025, 50080, 50135, 50189, 50244, 50298, 50353, 50408, 50462, 50517, 50571, 50626, 50681, 50735, 50790, 50845, 50899, 50954, 51008, 51063, 51118, 51172, 51227, 51281, 51336, 51391, 51445, 51500, 51554, 51609, 51664, 51718, 51773, 51828, 51882, 51937, 51991, 52046, 52101, 52155, 52210, 52264, 52319, 52374, 52428, 52483, 52538, 52592, 52647, 52701, 52756, 52811, 52865, 52920, 52974, 53029, 53084, 53138, 53193, 53247, 53248, 53302, 53357, 53411, 53466, 53521, 53575, 53630, 53684, 53739, 53794, 53848, 53903, 53957, 54012, 54067, 54121, 54176, 54231, 54285, 54340, 54394, 54449, 54504, 54558, 54613, 54667, 54722, 54777, 54831, 54886, 54941, 54995, 55050, 55104, 55159, 55214, 55268, 55323, 55377, 55432, 55487, 55541, 55596, 55650, 55705, 55760, 55814, 55869, 55924, 55978, 56033, 56087, 56142, 56197, 56251, 56306, 56360, 56415, 56470, 56524, 56579, 56634, 56688, 56743, 56797, 56852, 56907, 56961, 57016, 57070, 57125, 57180, 57234, 57289, 57343, 57344, 57398, 57453, 57507, 57562, 57617, 57671, 57726, 57780, 57835, 57890, 57944, 57999, 58053, 58108, 58163, 58217, 58272, 58327, 58381, 58436, 58490, 58545, 58600, 58654, 58709, 58763, 58818, 58873, 58927, 58982, 59037, 59091, 59146, 59200, 59255, 59310, 59364, 59419, 59473, 59528, 59583, 59637, 59692, 59746, 59801, 59856, 59910, 59965, 60020, 60074, 60129, 60183, 60238, 60293, 60347, 60402, 60456, 60511, 60566, 60620, 60675, 60730, 60784, 60839, 60893, 60948, 61003, 61057, 61112, 61166, 61221, 61276, 61330, 61385, 61440, 61494, 61549, 61603, 61658, 61713, 61767, 61822, 61876, 61931, 61986, 62040, 62095, 62149, 62204, 62259, 62313, 62368, 62423, 62477, 62532, 62586, 62641, 62696, 62750, 62805, 62859, 62914, 62969, 63023, 63078, 63133, 63187, 63242, 63296, 63351, 63406, 63460, 63515, 63569, 63624, 63679, 63733, 63788, 63842, 63897, 63952, 64006, 64061, 64116, 64170, 64225, 64279, 64334, 64389, 64443, 64498, 64552, 64607, 64662, 64716, 64771, 64826, 64880, 64935, 64989, 65044, 65099, 65153, 65208, 65262, 65317, 65372, 65426, 65481, 65535, 65536, 65645, 65754, 65863, 65972, 66082, 66191, 66300, 66409, 66519, 66628, 66737, 66846, 66955, 67065, 67174, 67283, 67392, 67502, 67611, 67720, 67829, 67938, 68048, 68157, 68266, 68375, 68485, 68594, 68703, 68812, 68922, 69031, 69140, 69249, 69358, 69468, 69577, 69686, 69795, 69905, 70014, 70123, 70232, 70341, 70451, 70560, 70669, 70778, 70888, 70997, 71106, 71215, 71325, 71434, 71543, 71652, 71761, 71871, 71980, 72089, 72198, 72308, 72417, 72526, 72635, 72744, 72854, 72963, 73072, 73181, 73291, 73400, 73509, 73618, 73727, 73728, 73837, 73946, 74055, 74164, 74274, 74383, 74492, 74601, 74711, 74820, 74929, 75038, 75147, 75257, 75366, 75475, 75584, 75694, 75803, 75912, 76021, 76130, 76240, 76349, 76458, 76567, 76677, 76786, 76895, 77004, 77114, 77223, 77332, 77441, 77550, 77660, 77769, 77878, 77987, 78097, 78206, 78315, 78424, 78533, 78643, 78752, 78861, 78970, 79080, 79189, 79298, 79407, 79517, 79626, 79735, 79844, 79953, 80063, 80172, 80281, 80390, 80500, 80609, 80718, 80827, 80936, 81046, 81155, 81264, 81373, 81483, 81592, 81701, 81810, 81919, 81920, 82029, 82138, 82247, 82356, 82466, 82575, 82684, 82793, 82903, 83012, 83121, 83230, 83339, 83449, 83558, 83667, 83776, 83886, 83995, 84104, 84213, 84322, 84432, 84541, 84650, 84759, 84869, 84978, 85087, 85196, 85306, 85415, 85524, 85633, 85742, 85852, 85961, 86070, 86179, 86289, 86398, 86507, 86616, 86725, 86835, 86944, 87053, 87162, 87272, 87381, 87490, 87599, 87709, 87818, 87927, 88036, 88145, 88255, 88364, 88473, 88582, 88692, 88801, 88910, 89019, 89128, 89238, 89347, 89456, 89565, 89675, 89784, 89893, 90002, 90111, 90112, 90221, 90330, 90439, 90548, 90658, 90767, 90876, 90985, 91095, 91204, 91313, 91422, 91531, 91641, 91750, 91859, 91968, 92078, 92187, 92296, 92405, 92514, 92624, 92733, 92842, 92951, 93061, 93170, 93279, 93388, 93498, 93607, 93716, 93825, 93934, 94044, 94153, 94262, 94371, 94481, 94590, 94699, 94808, 94917, 95027, 95136, 95245, 95354, 95464, 95573, 95682, 95791, 95901, 96010, 96119, 96228, 96337, 96447, 96556, 96665, 96774, 96884, 96993, 97102, 97211, 97320, 97430, 97539, 97648, 97757, 97867, 97976, 98085, 98194, 98303, 98304, 98413, 98522, 98631, 98740, 98850, 98959, 99068, 99177, 99287, 99396, 99505, 99614, 99723, 99833, 99942, 100051, 100160, 100270, 100379, 100488, 100597, 100706, 100816, 100925, 101034, 101143, 101253, 101362, 101471, 101580, 101690, 101799, 101908, 102017, 102126, 102236, 102345, 102454, 102563, 102673, 102782, 102891, 103000, 103109, 103219, 103328, 103437, 103546, 103656, 103765, 103874, 103983, 104093, 104202, 104311, 104420, 104529, 104639, 104748, 104857, 104966, 105076, 105185, 105294, 105403, 105512, 105622, 105731, 105840, 105949, 106059, 106168, 106277, 106386, 106495, 106496, 106605, 106714, 106823, 106932, 107042, 107151, 107260, 107369, 107479, 107588, 107697, 107806, 107915, 108025, 108134, 108243, 108352, 108462, 108571, 108680, 108789, 108898, 109008, 109117, 109226, 109335, 109445, 109554, 109663, 109772, 109882, 109991, 110100, 110209, 110318, 110428, 110537, 110646, 110755, 110865, 110974, 111083, 111192, 111301, 111411, 111520, 111629, 111738, 111848, 111957, 112066, 112175, 112285, 112394, 112503, 112612, 112721, 112831, 112940, 113049, 113158, 113268, 113377, 113486, 113595, 113704, 113814, 113923, 114032, 114141, 114251, 114360, 114469, 114578, 114687, 114688, 114797, 114906, 115015, 115124, 115234, 115343, 115452, 115561, 115671, 115780, 115889, 115998, 116107, 116217, 116326, 116435, 116544, 116654, 116763, 116872, 116981, 117090, 117200, 117309, 117418, 117527, 117637, 117746, 117855, 117964, 118074, 118183, 118292, 118401, 118510, 118620, 118729, 118838, 118947, 119057, 119166, 119275, 119384, 119493, 119603, 119712, 119821, 119930, 120040, 120149, 120258, 120367, 120477, 120586, 120695, 120804, 120913, 121023, 121132, 121241, 121350, 121460, 121569, 121678, 121787, 121896, 122006, 122115, 122224, 122333, 122443, 122552, 122661, 122770, 122880, 122989, 123098, 123207, 123316, 123426, 123535, 123644, 123753, 123863, 123972, 124081, 124190, 124299, 124409, 124518, 124627, 124736, 124846, 124955, 125064, 125173, 125282, 125392, 125501, 125610, 125719, 125829, 125938, 126047, 126156, 126266, 126375, 126484, 126593, 126702, 126812, 126921, 127030, 127139, 127249, 127358, 127467, 127576, 127685, 127795, 127904, 128013, 128122, 128232, 128341, 128450, 128559, 128669, 128778, 128887, 128996, 129105, 129215, 129324, 129433, 129542, 129652, 129761, 129870, 129979, 130088, 130198, 130307, 130416, 130525, 130635, 130744, 130853, 130962, 131071, 131072, 131290, 131508, 131727, 131945, 132164, 132382, 132601, 132819, 133038, 133256, 133474, 133475, 133693, 133911, 134130, 134348, 134567, 134785, 135004, 135222, 135441, 135659, 135877, 136096, 136314, 136533, 136751, 136970, 137188, 137407, 137625, 137844, 138062, 138280, 138499, 138717, 138936, 139154, 139373, 139591, 139810, 140028, 140247, 140465, 140683, 140902, 141120, 141339, 141557, 141776, 141994, 142213, 142431, 142650, 142868, 143086, 143305, 143523, 143742, 143960, 144179, 144397, 144616, 144834, 145053, 145271, 145489, 145708, 145926, 146145, 146363, 146582, 146800, 147019, 147237, 147455, 147456, 147674, 147892, 148111, 148329, 148548, 148766, 148985, 149203, 149422, 149640, 149858, 149859, 150077, 150295, 150514, 150732, 150951, 151169, 151388, 151606, 151825, 152043, 152261, 152480, 152698, 152917, 153135, 153354, 153572, 153791, 154009, 154228, 154446, 154664, 154883, 155101, 155320, 155538, 155757, 155975, 156194, 156412, 156631, 156849, 157067, 157286, 157504, 157723, 157941, 158160, 158378, 158597, 158815, 159034, 159252, 159470, 159689, 159907, 160126, 160344, 160563, 160781, 161000, 161218, 161437, 161655, 161873, 162092, 162310, 162529, 162747, 162966, 163184, 163403, 163621, 163839, 163840, 164058, 164276, 164495, 164713, 164932, 165150, 165369, 165587, 165806, 166024, 166242, 166243, 166461, 166679, 166898, 167116, 167335, 167553, 167772, 167990, 168209, 168427, 168645, 168864, 169082, 169301, 169519, 169738, 169956, 170175, 170393, 170612, 170830, 171048, 171267, 171485, 171704, 171922, 172141, 172359, 172578, 172796, 173015, 173233, 173451, 173670, 173888, 174107, 174325, 174544, 174762, 174981, 175199, 175418, 175636, 175854, 176073, 176291, 176510, 176728, 176947, 177165, 177384, 177602, 177821, 178039, 178257, 178476, 178694, 178913, 179131, 179350, 179568, 179787, 180005, 180223, 180224, 180442, 180660, 180879, 181097, 181316, 181534, 181753, 181971, 182190, 182408, 182626, 182627, 182845, 183063, 183282, 183500, 183719, 183937, 184156, 184374, 184593, 184811, 185029, 185248, 185466, 185685, 185903, 186122, 186340, 186559, 186777, 186996, 187214, 187432, 187651, 187869, 188088, 188306, 188525, 188743, 188962, 189180, 189399, 189617, 189835, 190054, 190272, 190491, 190709, 190928, 191146, 191365, 191583, 191802, 192020, 192238, 192457, 192675, 192894, 193112, 193331, 193549, 193768, 193986, 194205, 194423, 194641, 194860, 195078, 195297, 195515, 195734, 195952, 196171, 196389, 196607, 196608, 196826, 197044, 197263, 197481, 197700, 197918, 198137, 198355, 198574, 198792, 199010, 199011, 199229, 199447, 199666, 199884, 200103, 200321, 200540, 200758, 200977, 201195, 201413, 201632, 201850, 202069, 202287, 202506, 202724, 202943, 203161, 203380, 203598, 203816, 204035, 204253, 204472, 204690, 204909, 205127, 205346, 205564, 205783, 206001, 206219, 206438, 206656, 206875, 207093, 207312, 207530, 207749, 207967, 208186, 208404, 208622, 208841, 209059, 209278, 209496, 209715, 209933, 210152, 210370, 210589, 210807, 211025, 211244, 211462, 211681, 211899, 212118, 212336, 212555, 212773, 212991, 212992, 213210, 213428, 213647, 213865, 214084, 214302, 214521, 214739, 214958, 215176, 215394, 215395, 215613, 215831, 216050, 216268, 216487, 216705, 216924, 217142, 217361, 217579, 217797, 218016, 218234, 218453, 218671, 218890, 219108, 219327, 219545, 219764, 219982, 220200, 220419, 220637, 220856, 221074, 221293, 221511, 221730, 221948, 222167, 222385, 222603, 222822, 223040, 223259, 223477, 223696, 223914, 224133, 224351, 224570, 224788, 225006, 225225, 225443, 225662, 225880, 226099, 226317, 226536, 226754, 226973, 227191, 227409, 227628, 227846, 228065, 228283, 228502, 228720, 228939, 229157, 229375, 229376, 229594, 229812, 230031, 230249, 230468, 230686, 230905, 231123, 231342, 231560, 231778, 231779, 231997, 232215, 232434, 232652, 232871, 233089, 233308, 233526, 233745, 233963, 234181, 234400, 234618, 234837, 235055, 235274, 235492, 235711, 235929, 236148, 236366, 236584, 236803, 237021, 237240, 237458, 237677, 237895, 238114, 238332, 238551, 238769, 238987, 239206, 239424, 239643, 239861, 240080, 240298, 240517, 240735, 240954, 241172, 241390, 241609, 241827, 242046, 242264, 242483, 242701, 242920, 243138, 243357, 243575, 243793, 244012, 244230, 244449, 244667, 244886, 245104, 245323, 245541, 245760, 245978, 246196, 246415, 246633, 246852, 247070, 247289, 247507, 247726, 247944, 248162, 248163, 248381, 248599, 248818, 249036, 249255, 249473, 249692, 249910, 250129, 250347, 250565, 250784, 251002, 251221, 251439, 251658, 251876, 252095, 252313, 252532, 252750, 252968, 253187, 253405, 253624, 253842, 254061, 254279, 254498, 254716, 254935, 255153, 255371, 255590, 255808, 256027, 256245, 256464, 256682, 256901, 257119, 257338, 257556, 257774, 257993, 258211, 258430, 258648, 258867, 259085, 259304, 259522, 259741, 259959, 260177, 260396, 260614, 260833, 261051, 261270, 261488, 261707, 261925, 262143, 262144, 262580, 263017, 263454, 263891, 264328, 264765, 265202, 265639, 266076, 266513, 266949, 266950, 267386, 267823, 268260, 268697, 269134, 269571, 270008, 270445, 270882, 271319, 271755, 272192, 272629, 273066, 273503, 273940, 274377, 274814, 275251, 275688, 276125, 276561, 276998, 277435, 277872, 278309, 278746, 279183, 279620, 280057, 280494, 280930, 280931, 281367, 281804, 282241, 282678, 283115, 283552, 283989, 284426, 284863, 285300, 285736, 286173, 286610, 287047, 287484, 287921, 288358, 288795, 289232, 289669, 290106, 290542, 290979, 291416, 291853, 292290, 292727, 293164, 293601, 294038, 294475, 294911, 294912, 295348, 295785, 296222, 296659, 297096, 297533, 297970, 298407, 298844, 299281, 299717, 299718, 300154, 300591, 301028, 301465, 301902, 302339, 302776, 303213, 303650, 304087, 304523, 304960, 305397, 305834, 306271, 306708, 307145, 307582, 308019, 308456, 308893, 309329, 309766, 310203, 310640, 311077, 311514, 311951, 312388, 312825, 313262, 313698, 313699, 314135, 314572, 315009, 315446, 315883, 316320, 316757, 317194, 317631, 318068, 318504, 318941, 319378, 319815, 320252, 320689, 321126, 321563, 322000, 322437, 322874, 323310, 323747, 324184, 324621, 325058, 325495, 325932, 326369, 326806, 327243, 327679, 327680, 328116, 328553, 328990, 329427, 329864, 330301, 330738, 331175, 331612, 332049, 332485, 332486, 332922, 333359, 333796, 334233, 334670, 335107, 335544, 335981, 336418, 336855, 337291, 337728, 338165, 338602, 339039, 339476, 339913, 340350, 340787, 341224, 341661, 342097, 342534, 342971, 343408, 343845, 344282, 344719, 345156, 345593, 346030, 346466, 346467, 346903, 347340, 347777, 348214, 348651, 349088, 349525, 349962, 350399, 350836, 351272, 351709, 352146, 352583, 353020, 353457, 353894, 354331, 354768, 355205, 355642, 356078, 356515, 356952, 357389, 357826, 358263, 358700, 359137, 359574, 360011, 360447, 360448, 360884, 361321, 361758, 362195, 362632, 363069, 363506, 363943, 364380, 364817, 365253, 365254, 365690, 366127, 366564, 367001, 367438, 367875, 368312, 368749, 369186, 369623, 370059, 370496, 370933, 371370, 371807, 372244, 372681, 373118, 373555, 373992, 374429, 374865, 375302, 375739, 376176, 376613, 377050, 377487, 377924, 378361, 378798, 379234, 379235, 379671, 380108, 380545, 380982, 381419, 381856, 382293, 382730, 383167, 383604, 384040, 384477, 384914, 385351, 385788, 386225, 386662, 387099, 387536, 387973, 388410, 388846, 389283, 389720, 390157, 390594, 391031, 391468, 391905, 392342, 392779, 393215, 393216, 393652, 394089, 394526, 394963, 395400, 395837, 396274, 396711, 397148, 397585, 398021, 398022, 398458, 398895, 399332, 399769, 400206, 400643, 401080, 401517, 401954, 402391, 402827, 403264, 403701, 404138, 404575, 405012, 405449, 405886, 406323, 406760, 407197, 407633, 408070, 408507, 408944, 409381, 409818, 410255, 410692, 411129, 411566, 412002, 412003, 412439, 412876, 413313, 413750, 414187, 414624, 415061, 415498, 415935, 416372, 416808, 417245, 417682, 418119, 418556, 418993, 419430, 419867, 420304, 420741, 421178, 421614, 422051, 422488, 422925, 423362, 423799, 424236, 424673, 425110, 425547, 425983, 425984, 426420, 426857, 427294, 427731, 428168, 428605, 429042, 429479, 429916, 430353, 430789, 430790, 431226, 431663, 432100, 432537, 432974, 433411, 433848, 434285, 434722, 435159, 435595, 436032, 436469, 436906, 437343, 437780, 438217, 438654, 439091, 439528, 439965, 440401, 440838, 441275, 441712, 442149, 442586, 443023, 443460, 443897, 444334, 444770, 444771, 445207, 445644, 446081, 446518, 446955, 447392, 447829, 448266, 448703, 449140, 449576, 450013, 450450, 450887, 451324, 451761, 452198, 452635, 453072, 453509, 453946, 454382, 454819, 455256, 455693, 456130, 456567, 457004, 457441, 457878, 458315, 458751, 458752, 459188, 459625, 460062, 460499, 460936, 461373, 461810, 462247, 462684, 463121, 463557, 463558, 463994, 464431, 464868, 465305, 465742, 466179, 466616, 467053, 467490, 467927, 468363, 468800, 469237, 469674, 470111, 470548, 470985, 471422, 471859, 472296, 472733, 473169, 473606, 474043, 474480, 474917, 475354, 475791, 476228, 476665, 477102, 477538, 477539, 477975, 478412, 478849, 479286, 479723, 480160, 480597, 481034, 481471, 481908, 482344, 482781, 483218, 483655, 484092, 484529, 484966, 485403, 485840, 486277, 486714, 487150, 487587, 488024, 488461, 488898, 489335, 489772, 490209, 490646, 491083, 491520, 491956, 492393, 492830, 493267, 493704, 494141, 494578, 495015, 495452, 495889, 496325, 496326, 496762, 497199, 497636, 498073, 498510, 498947, 499384, 499821, 500258, 500695, 501131, 501568, 502005, 502442, 502879, 503316, 503753, 504190, 504627, 505064, 505501, 505937, 506374, 506811, 507248, 507685, 508122, 508559, 508996, 509433, 509870, 510306, 510307, 510743, 511180, 511617, 512054, 512491, 512928, 513365, 513802, 514239, 514676, 515112, 515549, 515986, 516423, 516860, 517297, 517734, 518171, 518608, 519045, 519482, 519918, 520355, 520792, 521229, 521666, 522103, 522540, 522977, 523414, 523851, 524287, 524288, 525161, 526035, 526909, 527783, 528657, 529530, 530404, 531278, 532152, 533026, 533899, 533900, 534773, 535647, 536521, 537395, 538269, 539142, 540016, 540890, 541764, 542638, 543511, 544385, 545259, 546133, 547007, 547880, 547881, 548754, 549628, 550502, 551376, 552250, 553123, 553997, 554871, 555745, 556619, 557492, 558366, 559240, 560114, 560988, 561861, 561862, 562735, 563609, 564483, 565357, 566231, 567104, 567978, 568852, 569726, 570600, 571473, 572347, 573221, 574095, 574969, 575842, 575843, 576716, 577590, 578464, 579338, 580212, 581085, 581959, 582833, 583707, 584581, 585454, 586328, 587202, 588076, 588950, 589823, 589824, 590697, 591571, 592445, 593319, 594193, 595066, 595940, 596814, 597688, 598562, 599435, 599436, 600309, 601183, 602057, 602931, 603805, 604678, 605552, 606426, 607300, 608174, 609047, 609921, 610795, 611669, 612543, 613416, 613417, 614290, 615164, 616038, 616912, 617786, 618659, 619533, 620407, 621281, 622155, 623028, 623902, 624776, 625650, 626524, 627397, 627398, 628271, 629145, 630019, 630893, 631767, 632640, 633514, 634388, 635262, 636136, 637009, 637883, 638757, 639631, 640505, 641378, 641379, 642252, 643126, 644000, 644874, 645748, 646621, 647495, 648369, 649243, 650117, 650990, 651864, 652738, 653612, 654486, 655359, 655360, 656233, 657107, 657981, 658855, 659729, 660602, 661476, 662350, 663224, 664098, 664971, 664972, 665845, 666719, 667593, 668467, 669341, 670214, 671088, 671962, 672836, 673710, 674583, 675457, 676331, 677205, 678079, 678952, 678953, 679826, 680700, 681574, 682448, 683322, 684195, 685069, 685943, 686817, 687691, 688564, 689438, 690312, 691186, 692060, 692933, 692934, 693807, 694681, 695555, 696429, 697303, 698176, 699050, 699924, 700798, 701672, 702545, 703419, 704293, 705167, 706041, 706914, 706915, 707788, 708662, 709536, 710410, 711284, 712157, 713031, 713905, 714779, 715653, 716526, 717400, 718274, 719148, 720022, 720895, 720896, 721769, 722643, 723517, 724391, 725265, 726138, 727012, 727886, 728760, 729634, 730507, 730508, 731381, 732255, 733129, 734003, 734877, 735750, 736624, 737498, 738372, 739246, 740119, 740993, 741867, 742741, 743615, 744488, 744489, 745362, 746236, 747110, 747984, 748858, 749731, 750605, 751479, 752353, 753227, 754100, 754974, 755848, 756722, 757596, 758469, 758470, 759343, 760217, 761091, 761965, 762839, 763712, 764586, 765460, 766334, 767208, 768081, 768955, 769829, 770703, 771577, 772450, 772451, 773324, 774198, 775072, 775946, 776820, 777693, 778567, 779441, 780315, 781189, 782062, 782936, 783810, 784684, 785558, 786431, 786432, 787305, 788179, 789053, 789927, 790801, 791674, 792548, 793422, 794296, 795170, 796043, 796044, 796917, 797791, 798665, 799539, 800413, 801286, 802160, 803034, 803908, 804782, 805655, 806529, 807403, 808277, 809151, 810024, 810025, 810898, 811772, 812646, 813520, 814394, 815267, 816141, 817015, 817889, 818763, 819636, 820510, 821384, 822258, 823132, 824005, 824006, 824879, 825753, 826627, 827501, 828375, 829248, 830122, 830996, 831870, 832744, 833617, 834491, 835365, 836239, 837113, 837986, 837987, 838860, 839734, 840608, 841482, 842356, 843229, 844103, 844977, 845851, 846725, 847598, 848472, 849346, 850220, 851094, 851967, 851968, 852841, 853715, 854589, 855463, 856337, 857210, 858084, 858958, 859832, 860706, 861579, 861580, 862453, 863327, 864201, 865075, 865949, 866822, 867696, 868570, 869444, 870318, 871191, 872065, 872939, 873813, 874687, 875560, 875561, 876434, 877308, 878182, 879056, 879930, 880803, 881677, 882551, 883425, 884299, 885172, 886046, 886920, 887794, 888668, 889541, 889542, 890415, 891289, 892163, 893037, 893911, 894784, 895658, 896532, 897406, 898280, 899153, 900027, 900901, 901775, 902649, 903522, 903523, 904396, 905270, 906144, 907018, 907892, 908765, 909639, 910513, 911387, 912261, 913134, 914008, 914882, 915756, 916630, 917503, 917504, 918377, 919251, 920125, 920999, 921873, 922746, 923620, 924494, 925368, 926242, 927115, 927116, 927989, 928863, 929737, 930611, 931485, 932358, 933232, 934106, 934980, 935854, 936727, 937601, 938475, 939349, 940223, 941096, 941097, 941970, 942844, 943718, 944592, 945466, 946339, 947213, 948087, 948961, 949835, 950708, 951582, 952456, 953330, 954204, 955077, 955078, 955951, 956825, 957699, 958573, 959447, 960320, 961194, 962068, 962942, 963816, 964689, 965563, 966437, 967311, 968185, 969058, 969059, 969932, 970806, 971680, 972554, 973428, 974301, 975175, 976049, 976923, 977797, 978670, 979544, 980418, 981292, 982166, 983040, 983913, 984787, 985661, 986535, 987409, 988282, 989156, 990030, 990904, 991778, 992651, 992652, 993525, 994399, 995273, 996147, 997021, 997894, 998768, 999642, 1000516, 1001390, 1002263, 1003137, 1004011, 1004885, 1005759, 1006632, 1006633, 1007506, 1008380, 1009254, 1010128, 1011002, 1011875, 1012749, 1013623, 1014497, 1015371, 1016244, 1017118, 1017992, 1018866, 1019740, 1020613, 1020614, 1021487, 1022361, 1023235, 1024109, 1024983, 1025856, 1026730, 1027604, 1028478, 1029352, 1030225, 1031099, 1031973, 1032847, 1033721, 1034594, 1034595, 1035468, 1036342, 1037216, 1038090, 1038964, 1039837, 1040711, 1041585, 1042459, 1043333, 1044206, 1045080, 1045954, 1046828, 1047702, 1048575, 1048576, 1050323, 1052071, 1053818, 1053819, 1055566, 1057314, 1059061, 1060809, 1062557, 1064304, 1066052, 1067799, 1067800, 1069547, 1071295, 1073042, 1074790, 1076538, 1078285, 1080033, 1081780, 1081781, 1083528, 1085276, 1087023, 1088771, 1090519, 1092266, 1094014, 1095761, 1095762, 1097509, 1099257, 1101004, 1102752, 1104500, 1106247, 1107995, 1109742, 1109743, 1111490, 1113238, 1114985, 1116733, 1118481, 1120228, 1121976, 1123723, 1123724, 1125471, 1127219, 1128966, 1130714, 1132462, 1134209, 1135957, 1137704, 1137705, 1139452, 1141200, 1142947, 1144695, 1146443, 1148190, 1149938, 1151685, 1151686, 1153433, 1155181, 1156928, 1158676, 1160424, 1162171, 1163919, 1165666, 1165667, 1167414, 1169162, 1170909, 1172657, 1174405, 1176152, 1177900, 1179647, 1179648, 1181395, 1183143, 1184890, 1184891, 1186638, 1188386, 1190133, 1191881, 1193629, 1195376, 1197124, 1198871, 1198872, 1200619, 1202367, 1204114, 1205862, 1207610, 1209357, 1211105, 1212852, 1212853, 1214600, 1216348, 1218095, 1219843, 1221591, 1223338, 1225086, 1226833, 1226834, 1228581, 1230329, 1232076, 1233824, 1235572, 1237319, 1239067, 1240814, 1240815, 1242562, 1244310, 1246057, 1247805, 1249553, 1251300, 1253048, 1254795, 1254796, 1256543, 1258291, 1260038, 1261786, 1263534, 1265281, 1267029, 1268776, 1268777, 1270524, 1272272, 1274019, 1275767, 1277515, 1279262, 1281010, 1282757, 1282758, 1284505, 1286253, 1288000, 1289748, 1291496, 1293243, 1294991, 1296738, 1296739, 1298486, 1300234, 1301981, 1303729, 1305477, 1307224, 1308972, 1310719, 1310720, 1312467, 1314215, 1315962, 1315963, 1317710, 1319458, 1321205, 1322953, 1324701, 1326448, 1328196, 1329943, 1329944, 1331691, 1333439, 1335186, 1336934, 1338682, 1340429, 1342177, 1343924, 1343925, 1345672, 1347420, 1349167, 1350915, 1352663, 1354410, 1356158, 1357905, 1357906, 1359653, 1361401, 1363148, 1364896, 1366644, 1368391, 1370139, 1371886, 1371887, 1373634, 1375382, 1377129, 1378877, 1380625, 1382372, 1384120, 1385867, 1385868, 1387615, 1389363, 1391110, 1392858, 1394606, 1396353, 1398101, 1399848, 1399849, 1401596, 1403344, 1405091, 1406839, 1408587, 1410334, 1412082, 1413829, 1413830, 1415577, 1417325, 1419072, 1420820, 1422568, 1424315, 1426063, 1427810, 1427811, 1429558, 1431306, 1433053, 1434801, 1436549, 1438296, 1440044, 1441791, 1441792, 1443539, 1445287, 1447034, 1447035, 1448782, 1450530, 1452277, 1454025, 1455773, 1457520, 1459268, 1461015, 1461016, 1462763, 1464511, 1466258, 1468006, 1469754, 1471501, 1473249, 1474996, 1474997, 1476744, 1478492, 1480239, 1481987, 1483735, 1485482, 1487230, 1488977, 1488978, 1490725, 1492473, 1494220, 1495968, 1497716, 1499463, 1501211, 1502958, 1502959, 1504706, 1506454, 1508201, 1509949, 1511697, 1513444, 1515192, 1516939, 1516940, 1518687, 1520435, 1522182, 1523930, 1525678, 1527425, 1529173, 1530920, 1530921, 1532668, 1534416, 1536163, 1537911, 1539659, 1541406, 1543154, 1544901, 1544902, 1546649, 1548397, 1550144, 1551892, 1553640, 1555387, 1557135, 1558882, 1558883, 1560630, 1562378, 1564125, 1565873, 1567621, 1569368, 1571116, 1572863, 1572864, 1574611, 1576359, 1578106, 1578107, 1579854, 1581602, 1583349, 1585097, 1586845, 1588592, 1590340, 1592087, 1592088, 1593835, 1595583, 1597330, 1599078, 1600826, 1602573, 1604321, 1606068, 1606069, 1607816, 1609564, 1611311, 1613059, 1614807, 1616554, 1618302, 1620049, 1620050, 1621797, 1623545, 1625292, 1627040, 1628788, 1630535, 1632283, 1634030, 1634031, 1635778, 1637526, 1639273, 1641021, 1642769, 1644516, 1646264, 1648011, 1648012, 1649759, 1651507, 1653254, 1655002, 1656750, 1658497, 1660245, 1661992, 1661993, 1663740, 1665488, 1667235, 1668983, 1670731, 1672478, 1674226, 1675973, 1675974, 1677721, 1679469, 1681216, 1682964, 1684712, 1686459, 1688207, 1689954, 1689955, 1691702, 1693450, 1695197, 1696945, 1698693, 1700440, 1702188, 1703935, 1703936, 1705683, 1707431, 1709178, 1709179, 1710926, 1712674, 1714421, 1716169, 1717917, 1719664, 1721412, 1723159, 1723160, 1724907, 1726655, 1728402, 1730150, 1731898, 1733645, 1735393, 1737140, 1737141, 1738888, 1740636, 1742383, 1744131, 1745879, 1747626, 1749374, 1751121, 1751122, 1752869, 1754617, 1756364, 1758112, 1759860, 1761607, 1763355, 1765102, 1765103, 1766850, 1768598, 1770345, 1772093, 1773841, 1775588, 1777336, 1779083, 1779084, 1780831, 1782579, 1784326, 1786074, 1787822, 1789569, 1791317, 1793064, 1793065, 1794812, 1796560, 1798307, 1800055, 1801803, 1803550, 1805298, 1807045, 1807046, 1808793, 1810541, 1812288, 1814036, 1815784, 1817531, 1819279, 1821026, 1821027, 1822774, 1824522, 1826269, 1828017, 1829765, 1831512, 1833260, 1835007, 1835008, 1836755, 1838503, 1840250, 1840251, 1841998, 1843746, 1845493, 1847241, 1848989, 1850736, 1852484, 1854231, 1854232, 1855979, 1857727, 1859474, 1861222, 1862970, 1864717, 1866465, 1868212, 1868213, 1869960, 1871708, 1873455, 1875203, 1876951, 1878698, 1880446, 1882193, 1882194, 1883941, 1885689, 1887436, 1889184, 1890932, 1892679, 1894427, 1896174, 1896175, 1897922, 1899670, 1901417, 1903165, 1904913, 1906660, 1908408, 1910155, 1910156, 1911903, 1913651, 1915398, 1917146, 1918894, 1920641, 1922389, 1924136, 1924137, 1925884, 1927632, 1929379, 1931127, 1932875, 1934622, 1936370, 1938117, 1938118, 1939865, 1941613, 1943360, 1945108, 1946856, 1948603, 1950351, 1952098, 1952099, 1953846, 1955594, 1957341, 1959089, 1960837, 1962584, 1964332, 1966080, 1967827, 1969575, 1971322, 1971323, 1973070, 1974818, 1976565, 1978313, 1980061, 1981808, 1983556, 1985303, 1985304, 1987051, 1988799, 1990546, 1992294, 1994042, 1995789, 1997537, 1999284, 1999285, 2001032, 2002780, 2004527, 2006275, 2008023, 2009770, 2011518, 2013265, 2013266, 2015013, 2016761, 2018508, 2020256, 2022004, 2023751, 2025499, 2027246, 2027247, 2028994, 2030742, 2032489, 2034237, 2035985, 2037732, 2039480, 2041227, 2041228, 2042975, 2044723, 2046470, 2048218, 2049966, 2051713, 2053461, 2055208, 2055209, 2056956, 2058704, 2060451, 2062199, 2063947, 2065694, 2067442, 2069189, 2069190, 2070937, 2072685, 2074432, 2076180, 2077928, 2079675, 2081423, 2083170, 2083171, 2084918, 2086666, 2088413, 2090161, 2091909, 2093656, 2095404, 2097151, 2097152, 2100647, 2104142, 2107637, 2107638, 2111133, 2114628, 2118123, 2121618, 2121619, 2125114, 2128609, 2132104, 2135599, 2135600, 2139095, 2142590, 2146085, 2149580, 2149581, 2153076, 2156571, 2160066, 2163561, 2163562, 2167057, 2170552, 2174047, 2177542, 2177543, 2181038, 2184533, 2188028, 2191523, 2191524, 2195019, 2198514, 2202009, 2205504, 2205505, 2209000, 2212495, 2215990, 2219485, 2219486, 2222981, 2226476, 2229971, 2233466, 2233467, 2236962, 2240457, 2243952, 2247447, 2247448, 2250943, 2254438, 2257933, 2261428, 2261429, 2264924, 2268419, 2271914, 2275409, 2275410, 2278905, 2282400, 2285895, 2289390, 2289391, 2292886, 2296381, 2299876, 2303371, 2303372, 2306867, 2310362, 2313857, 2317352, 2317353, 2320848, 2324343, 2327838, 2331333, 2331334, 2334829, 2338324, 2341819, 2345314, 2345315, 2348810, 2352305, 2355800, 2359295, 2359296, 2362791, 2366286, 2369781, 2369782, 2373277, 2376772, 2380267, 2383762, 2383763, 2387258, 2390753, 2394248, 2397743, 2397744, 2401239, 2404734, 2408229, 2411724, 2411725, 2415220, 2418715, 2422210, 2425705, 2425706, 2429201, 2432696, 2436191, 2439686, 2439687, 2443182, 2446677, 2450172, 2453667, 2453668, 2457163, 2460658, 2464153, 2467648, 2467649, 2471144, 2474639, 2478134, 2481629, 2481630, 2485125, 2488620, 2492115, 2495610, 2495611, 2499106, 2502601, 2506096, 2509591, 2509592, 2513087, 2516582, 2520077, 2523572, 2523573, 2527068, 2530563, 2534058, 2537553, 2537554, 2541049, 2544544, 2548039, 2551534, 2551535, 2555030, 2558525, 2562020, 2565515, 2565516, 2569011, 2572506, 2576001, 2579496, 2579497, 2582992, 2586487, 2589982, 2593477, 2593478, 2596973, 2600468, 2603963, 2607458, 2607459, 2610954, 2614449, 2617944, 2621439, 2621440, 2624935, 2628430, 2631925, 2631926, 2635421, 2638916, 2642411, 2645906, 2645907, 2649402, 2652897, 2656392, 2659887, 2659888, 2663383, 2666878, 2670373, 2673868, 2673869, 2677364, 2680859, 2684354, 2687849, 2687850, 2691345, 2694840, 2698335, 2701830, 2701831, 2705326, 2708821, 2712316, 2715811, 2715812, 2719307, 2722802, 2726297, 2729792, 2729793, 2733288, 2736783, 2740278, 2743773, 2743774, 2747269, 2750764, 2754259, 2757754, 2757755, 2761250, 2764745, 2768240, 2771735, 2771736, 2775231, 2778726, 2782221, 2785716, 2785717, 2789212, 2792707, 2796202, 2799697, 2799698, 2803193, 2806688, 2810183, 2813678, 2813679, 2817174, 2820669, 2824164, 2827659, 2827660, 2831155, 2834650, 2838145, 2841640, 2841641, 2845136, 2848631, 2852126, 2855621, 2855622, 2859117, 2862612, 2866107, 2869602, 2869603, 2873098, 2876593, 2880088, 2883583, 2883584, 2887079, 2890574, 2894069, 2894070, 2897565, 2901060, 2904555, 2908050, 2908051, 2911546, 2915041, 2918536, 2922031, 2922032, 2925527, 2929022, 2932517, 2936012, 2936013, 2939508, 2943003, 2946498, 2949993, 2949994, 2953489, 2956984, 2960479, 2963974, 2963975, 2967470, 2970965, 2974460, 2977955, 2977956, 2981451, 2984946, 2988441, 2991936, 2991937, 2995432, 2998927, 3002422, 3005917, 3005918, 3009413, 3012908, 3016403, 3019898, 3019899, 3023394, 3026889, 3030384, 3033879, 3033880, 3037375, 3040870, 3044365, 3047860, 3047861, 3051356, 3054851, 3058346, 3061841, 3061842, 3065337, 3068832, 3072327, 3075822, 3075823, 3079318, 3082813, 3086308, 3089803, 3089804, 3093299, 3096794, 3100289, 3103784, 3103785, 3107280, 3110775, 3114270, 3117765, 3117766, 3121261, 3124756, 3128251, 3131746, 3131747, 3135242, 3138737, 3142232, 3145727, 3145728, 3149223, 3152718, 3156213, 3156214, 3159709, 3163204, 3166699, 3170194, 3170195, 3173690, 3177185, 3180680, 3184175, 3184176, 3187671, 3191166, 3194661, 3198156, 3198157, 3201652, 3205147, 3208642, 3212137, 3212138, 3215633, 3219128, 3222623, 3226118, 3226119, 3229614, 3233109, 3236604, 3240099, 3240100, 3243595, 3247090, 3250585, 3254080, 3254081, 3257576, 3261071, 3264566, 3268061, 3268062, 3271557, 3275052, 3278547, 3282042, 3282043, 3285538, 3289033, 3292528, 3296023, 3296024, 3299519, 3303014, 3306509, 3310004, 3310005, 3313500, 3316995, 3320490, 3323985, 3323986, 3327481, 3330976, 3334471, 3337966, 3337967, 3341462, 3344957, 3348452, 3351947, 3351948, 3355443, 3358938, 3362433, 3365928, 3365929, 3369424, 3372919, 3376414, 3379909, 3379910, 3383405, 3386900, 3390395, 3393890, 3393891, 3397386, 3400881, 3404376, 3407871, 3407872, 3411367, 3414862, 3418357, 3418358, 3421853, 3425348, 3428843, 3432338, 3432339, 3435834, 3439329, 3442824, 3446319, 3446320, 3449815, 3453310, 3456805, 3460300, 3460301, 3463796, 3467291, 3470786, 3474281, 3474282, 3477777, 3481272, 3484767, 3488262, 3488263, 3491758, 3495253, 3498748, 3502243, 3502244, 3505739, 3509234, 3512729, 3516224, 3516225, 3519720, 3523215, 3526710, 3530205, 3530206, 3533701, 3537196, 3540691, 3544186, 3544187, 3547682, 3551177, 3554672, 3558167, 3558168, 3561663, 3565158, 3568653, 3572148, 3572149, 3575644, 3579139, 3582634, 3586129, 3586130, 3589625, 3593120, 3596615, 3600110, 3600111, 3603606, 3607101, 3610596, 3614091, 3614092, 3617587, 3621082, 3624577, 3628072, 3628073, 3631568, 3635063, 3638558, 3642053, 3642054, 3645549, 3649044, 3652539, 3656034, 3656035, 3659530, 3663025, 3666520, 3670015, 3670016, 3673511, 3677006, 3680501, 3680502, 3683997, 3687492, 3690987, 3694482, 3694483, 3697978, 3701473, 3704968, 3708463, 3708464, 3711959, 3715454, 3718949, 3722444, 3722445, 3725940, 3729435, 3732930, 3736425, 3736426, 3739921, 3743416, 3746911, 3750406, 3750407, 3753902, 3757397, 3760892, 3764387, 3764388, 3767883, 3771378, 3774873, 3778368, 3778369, 3781864, 3785359, 3788854, 3792349, 3792350, 3795845, 3799340, 3802835, 3806330, 3806331, 3809826, 3813321, 3816816, 3820311, 3820312, 3823807, 3827302, 3830797, 3834292, 3834293, 3837788, 3841283, 3844778, 3848273, 3848274, 3851769, 3855264, 3858759, 3862254, 3862255, 3865750, 3869245, 3872740, 3876235, 3876236, 3879731, 3883226, 3886721, 3890216, 3890217, 3893712, 3897207, 3900702, 3904197, 3904198, 3907693, 3911188, 3914683, 3918178, 3918179, 3921674, 3925169, 3928664, 3932160, 3935655, 3939150, 3942645, 3942646, 3946141, 3949636, 3953131, 3956626, 3956627, 3960122, 3963617, 3967112, 3970607, 3970608, 3974103, 3977598, 3981093, 3984588, 3984589, 3988084, 3991579, 3995074, 3998569, 3998570, 4002065, 4005560, 4009055, 4012550, 4012551, 4016046, 4019541, 4023036, 4026531, 4026532, 4030027, 4033522, 4037017, 4040512, 4040513, 4044008, 4047503, 4050998, 4054493, 4054494, 4057989, 4061484, 4064979, 4068474, 4068475, 4071970, 4075465, 4078960, 4082455, 4082456, 4085951, 4089446, 4092941, 4096436, 4096437, 4099932, 4103427, 4106922, 4110417, 4110418, 4113913, 4117408, 4120903, 4124398, 4124399, 4127894, 4131389, 4134884, 4138379, 4138380, 4141875, 4145370, 4148865, 4152360, 4152361, 4155856, 4159351, 4162846, 4166341, 4166342, 4169837, 4173332, 4176827, 4180322, 4180323, 4183818, 4187313, 4190808, 4194303, 4194304, 4201294, 4201295, 4208285, 4215275, 4215276, 4222266, 4229256, 4229257, 4236247, 4243237, 4243238, 4250228, 4257218, 4257219, 4264209, 4271199, 4271200, 4278190, 4285180, 4285181, 4292171, 4299161, 4299162, 4306152, 4313142, 4313143, 4320133, 4327123, 4327124, 4334114, 4341104, 4341105, 4348095, 4355085, 4355086, 4362076, 4369066, 4369067, 4376057, 4383047, 4383048, 4390038, 4397028, 4397029, 4404019, 4411009, 4411010, 4418000, 4424990, 4424991, 4431981, 4438971, 4438972, 4445962, 4452952, 4452953, 4459943, 4466933, 4466934, 4473924, 4480914, 4480915, 4487905, 4494895, 4494896, 4501886, 4508876, 4508877, 4515867, 4522857, 4522858, 4529848, 4536838, 4536839, 4543829, 4550819, 4550820, 4557810, 4564800, 4564801, 4571791, 4578781, 4578782, 4585772, 4592762, 4592763, 4599753, 4606743, 4606744, 4613734, 4620724, 4620725, 4627715, 4634705, 4634706, 4641696, 4648686, 4648687, 4655677, 4662667, 4662668, 4669658, 4676648, 4676649, 4683639, 4690629, 4690630, 4697620, 4704610, 4704611, 4711601, 4718591, 4718592, 4725582, 4725583, 4732573, 4739563, 4739564, 4746554, 4753544, 4753545, 4760535, 4767525, 4767526, 4774516, 4781506, 4781507, 4788497, 4795487, 4795488, 4802478, 4809468, 4809469, 4816459, 4823449, 4823450, 4830440, 4837430, 4837431, 4844421, 4851411, 4851412, 4858402, 4865392, 4865393, 4872383, 4879373, 4879374, 4886364, 4893354, 4893355, 4900345, 4907335, 4907336, 4914326, 4921316, 4921317, 4928307, 4935297, 4935298, 4942288, 4949278, 4949279, 4956269, 4963259, 4963260, 4970250, 4977240, 4977241, 4984231, 4991221, 4991222, 4998212, 5005202, 5005203, 5012193, 5019183, 5019184, 5026174, 5033164, 5033165, 5040155, 5047145, 5047146, 5054136, 5061126, 5061127, 5068117, 5075107, 5075108, 5082098, 5089088, 5089089, 5096079, 5103069, 5103070, 5110060, 5117050, 5117051, 5124041, 5131031, 5131032, 5138022, 5145012, 5145013, 5152003, 5158993, 5158994, 5165984, 5172974, 5172975, 5179965, 5186955, 5186956, 5193946, 5200936, 5200937, 5207927, 5214917, 5214918, 5221908, 5228898, 5228899, 5235889, 5242879, 5242880, 5249870, 5249871, 5256861, 5263851, 5263852, 5270842, 5277832, 5277833, 5284823, 5291813, 5291814, 5298804, 5305794, 5305795, 5312785, 5319775, 5319776, 5326766, 5333756, 5333757, 5340747, 5347737, 5347738, 5354728, 5361718, 5361719, 5368709, 5375699, 5375700, 5382690, 5389680, 5389681, 5396671, 5403661, 5403662, 5410652, 5417642, 5417643, 5424633, 5431623, 5431624, 5438614, 5445604, 5445605, 5452595, 5459585, 5459586, 5466576, 5473566, 5473567, 5480557, 5487547, 5487548, 5494538, 5501528, 5501529, 5508519, 5515509, 5515510, 5522500, 5529490, 5529491, 5536481, 5543471, 5543472, 5550462, 5557452, 5557453, 5564443, 5571433, 5571434, 5578424, 5585414, 5585415, 5592405, 5599395, 5599396, 5606386, 5613376, 5613377, 5620367, 5627357, 5627358, 5634348, 5641338, 5641339, 5648329, 5655319, 5655320, 5662310, 5669300, 5669301, 5676291, 5683281, 5683282, 5690272, 5697262, 5697263, 5704253, 5711243, 5711244, 5718234, 5725224, 5725225, 5732215, 5739205, 5739206, 5746196, 5753186, 5753187, 5760177, 5767167, 5767168, 5774158, 5774159, 5781149, 5788139, 5788140, 5795130, 5802120, 5802121, 5809111, 5816101, 5816102, 5823092, 5830082, 5830083, 5837073, 5844063, 5844064, 5851054, 5858044, 5858045, 5865035, 5872025, 5872026, 5879016, 5886006, 5886007, 5892997, 5899987, 5899988, 5906978, 5913968, 5913969, 5920959, 5927949, 5927950, 5934940, 5941930, 5941931, 5948921, 5955911, 5955912, 5962902, 5969892, 5969893, 5976883, 5983873, 5983874, 5990864, 5997854, 5997855, 6004845, 6011835, 6011836, 6018826, 6025816, 6025817, 6032807, 6039797, 6039798, 6046788, 6053778, 6053779, 6060769, 6067759, 6067760, 6074750, 6081740, 6081741, 6088731, 6095721, 6095722, 6102712, 6109702, 6109703, 6116693, 6123683, 6123684, 6130674, 6137664, 6137665, 6144655, 6151645, 6151646, 6158636, 6165626, 6165627, 6172617, 6179607, 6179608, 6186598, 6193588, 6193589, 6200579, 6207569, 6207570, 6214560, 6221550, 6221551, 6228541, 6235531, 6235532, 6242522, 6249512, 6249513, 6256503, 6263493, 6263494, 6270484, 6277474, 6277475, 6284465, 6291455, 6291456, 6298446, 6298447, 6305437, 6312427, 6312428, 6319418, 6326408, 6326409, 6333399, 6340389, 6340390, 6347380, 6354370, 6354371, 6361361, 6368351, 6368352, 6375342, 6382332, 6382333, 6389323, 6396313, 6396314, 6403304, 6410294, 6410295, 6417285, 6424275, 6424276, 6431266, 6438256, 6438257, 6445247, 6452237, 6452238, 6459228, 6466218, 6466219, 6473209, 6480199, 6480200, 6487190, 6494180, 6494181, 6501171, 6508161, 6508162, 6515152, 6522142, 6522143, 6529133, 6536123, 6536124, 6543114, 6550104, 6550105, 6557095, 6564085, 6564086, 6571076, 6578066, 6578067, 6585057, 6592047, 6592048, 6599038, 6606028, 6606029, 6613019, 6620009, 6620010, 6627000, 6633990, 6633991, 6640981, 6647971, 6647972, 6654962, 6661952, 6661953, 6668943, 6675933, 6675934, 6682924, 6689914, 6689915, 6696905, 6703895, 6703896, 6710886, 6717876, 6717877, 6724867, 6731857, 6731858, 6738848, 6745838, 6745839, 6752829, 6759819, 6759820, 6766810, 6773800, 6773801, 6780791, 6787781, 6787782, 6794772, 6801762, 6801763, 6808753, 6815743, 6815744, 6822734, 6822735, 6829725, 6836715, 6836716, 6843706, 6850696, 6850697, 6857687, 6864677, 6864678, 6871668, 6878658, 6878659, 6885649, 6892639, 6892640, 6899630, 6906620, 6906621, 6913611, 6920601, 6920602, 6927592, 6934582, 6934583, 6941573, 6948563, 6948564, 6955554, 6962544, 6962545, 6969535, 6976525, 6976526, 6983516, 6990506, 6990507, 6997497, 7004487, 7004488, 7011478, 7018468, 7018469, 7025459, 7032449, 7032450, 7039440, 7046430, 7046431, 7053421, 7060411, 7060412, 7067402, 7074392, 7074393, 7081383, 7088373, 7088374, 7095364, 7102354, 7102355, 7109345, 7116335, 7116336, 7123326, 7130316, 7130317, 7137307, 7144297, 7144298, 7151288, 7158278, 7158279, 7165269, 7172259, 7172260, 7179250, 7186240, 7186241, 7193231, 7200221, 7200222, 7207212, 7214202, 7214203, 7221193, 7228183, 7228184, 7235174, 7242164, 7242165, 7249155, 7256145, 7256146, 7263136, 7270126, 7270127, 7277117, 7284107, 7284108, 7291098, 7298088, 7298089, 7305079, 7312069, 7312070, 7319060, 7326050, 7326051, 7333041, 7340031, 7340032, 7347022, 7347023, 7354013, 7361003, 7361004, 7367994, 7374984, 7374985, 7381975, 7388965, 7388966, 7395956, 7402946, 7402947, 7409937, 7416927, 7416928, 7423918, 7430908, 7430909, 7437899, 7444889, 7444890, 7451880, 7458870, 7458871, 7465861, 7472851, 7472852, 7479842, 7486832, 7486833, 7493823, 7500813, 7500814, 7507804, 7514794, 7514795, 7521785, 7528775, 7528776, 7535766, 7542756, 7542757, 7549747, 7556737, 7556738, 7563728, 7570718, 7570719, 7577709, 7584699, 7584700, 7591690, 7598680, 7598681, 7605671, 7612661, 7612662, 7619652, 7626642, 7626643, 7633633, 7640623, 7640624, 7647614, 7654604, 7654605, 7661595, 7668585, 7668586, 7675576, 7682566, 7682567, 7689557, 7696547, 7696548, 7703538, 7710528, 7710529, 7717519, 7724509, 7724510, 7731500, 7738490, 7738491, 7745481, 7752471, 7752472, 7759462, 7766452, 7766453, 7773443, 7780433, 7780434, 7787424, 7794414, 7794415, 7801405, 7808395, 7808396, 7815386, 7822376, 7822377, 7829367, 7836357, 7836358, 7843348, 7850338, 7850339, 7857329, 7864320, 7871310, 7871311, 7878301, 7885291, 7885292, 7892282, 7899272, 7899273, 7906263, 7913253, 7913254, 7920244, 7927234, 7927235, 7934225, 7941215, 7941216, 7948206, 7955196, 7955197, 7962187, 7969177, 7969178, 7976168, 7983158, 7983159, 7990149, 7997139, 7997140, 8004130, 8011120, 8011121, 8018111, 8025101, 8025102, 8032092, 8039082, 8039083, 8046073, 8053063, 8053064, 8060054, 8067044, 8067045, 8074035, 8081025, 8081026, 8088016, 8095006, 8095007, 8101997, 8108987, 8108988, 8115978, 8122968, 8122969, 8129959, 8136949, 8136950, 8143940, 8150930, 8150931, 8157921, 8164911, 8164912, 8171902, 8178892, 8178893, 8185883, 8192873, 8192874, 8199864, 8206854, 8206855, 8213845, 8220835, 8220836, 8227826, 8234816, 8234817, 8241807, 8248797, 8248798, 8255788, 8262778, 8262779, 8269769, 8276759, 8276760, 8283750, 8290740, 8290741, 8297731, 8304721, 8304722, 8311712, 8318702, 8318703, 8325693, 8332683, 8332684, 8339674, 8346664, 8346665, 8353655, 8360645, 8360646, 8367636, 8374626, 8374627, 8381617, 8388607) ORDER BY i ASC ;'

// const result1 = await pool.query(sql1);
    
// timeend('nomerge');



// timestart('merge');

// let sql2='SELECT i, minvd, maxvd FROM mock3_om3  where i in (  2051,2054,2058,2061,2065,2068,2071,2075,2078,2082,2085,2088,2092,2095,2099,2102,2106,2109,2112,2116,2119,2123,2126,2129,2133,2136,2140,2143,2146,2150,2153,2157,2160,2164,2167,2170,2174,2177,2181,2184,2187,2191,2194,2198,2201,2205,2208,2211,2215,2218,2222,2225,2228,2232,2235,2239,2242,2245,2249,2252,2256,2259,2263,2266,2269,2273,2276,2280,2283,2286,2290,2293,2297,2300,2303,2304,2307,2310,2314,2317,2321,2324,2327,2331,2334,2338,2341,2344,2348,2351,2355,2358,2362,2365,2368,2372,2375,2379,2382,2385,2389,2392,2396,2399,2402,2406,2409,2413,2416,2420,2423,2426,2430,2433,2437,2440,2443,2447,2450,2454,2457,2461,2464,2467,2471,2474,2478,2481,2484,2488,2491,2495,2498,2501,2505,2508,2512,2515,2519,2522,2525,2529,2532,2536,2539,2542,2546,2549,2553,2556,2559,2560,2563,2566,2570,2573,2577,2580,2583,2587,2590,2594,2597,2600,2604,2607,2611,2614,2618,2621,2624,2628,2631,2635,2638,2641,2645,2648,2652,2655,2658,2662,2665,2669,2672,2676,2679,2682,2686,2689,2693,2696,2699,2703,2706,2710,2713,2717,2720,2723,2727,2730,2734,2737,2740,2744,2747,2751,2754,2757,2761,2764,2768,2771,2775,2778,2781,2785,2788,2792,2795,2798,2802,2805,2809,2812,2815,2816,2819,2822,2826,2829,2833,2836,2839,2843,2846,2850,2853,2856,2860,2863,2867,2870,2874,2877,2880,2884,2887,2891,2894,2897,2901,2904,2908,2911,2914,2918,2921,2925,2928,2932,2935,2938,2942,2945,2949,2952,2955,2959,2962,2966,2969,2973,2976,2979,2983,2986,2990,2993,2996,3000,3003,3007,3010,3013,3017,3020,3024,3027,3031,3034,3037,3041,3044,3048,3051,3054,3058,3061,3065,3068,3071,3072,3075,3078,3082,3085,3089,3092,3095,3099,3102,3106,3109,3112,3116,3119,3123,3126,3130,3133,3136,3140,3143,3147,3150,3153,3157,3160,3164,3167,3170,3174,3177,3181,3184,3188,3191,3194,3198,3201,3205,3208,3211,3215,3218,3222,3225,3229,3232,3235,3239,3242,3246,3249,3252,3256,3259,3263,3266,3269,3273,3276,3280,3283,3287,3290,3293,3297,3300,3304,3307,3310,3314,3317,3321,3324,3327,3328,3331,3334,3338,3341,3345,3348,3351,3355,3358,3362,3365,3368,3372,3375,3379,3382,3386,3389,3392,3396,3399,3403,3406,3409,3413,3416,3420,3423,3426,3430,3433,3437,3440,3444,3447,3450,3454,3457,3461,3464,3467,3471,3474,3478,3481,3485,3488,3491,3495,3498,3502,3505,3508,3512,3515,3519,3522,3525,3529,3532,3536,3539,3543,3546,3549,3553,3556,3560,3563,3566,3570,3573,3577,3580,3583,3584,3587,3590,3594,3597,3601,3604,3607,3611,3614,3618,3621,3624,3628,3631,3635,3638,3642,3645,3648,3652,3655,3659,3662,3665,3669,3672,3676,3679,3682,3686,3689,3693,3696,3700,3703,3706,3710,3713,3717,3720,3723,3727,3730,3734,3737,3741,3744,3747,3751,3754,3758,3761,3764,3768,3771,3775,3778,3781,3785,3788,3792,3795,3799,3802,3805,3809,3812,3816,3819,3822,3826,3829,3833,3836,3840,3843,3846,3850,3853,3857,3860,3863,3867,3870,3874,3877,3880,3884,3887,3891,3894,3898,3901,3904,3908,3911,3915,3918,3921,3925,3928,3932,3935,3938,3942,3945,3949,3952,3956,3959,3962,3966,3969,3973,3976,3979,3983,3986,3990,3993,3997,4000,4003,4007,4010,4014,4017,4020,4024,4027,4031,4034,4037,4041,4044,4048,4051,4055,4058,4061,4065,4068,4072,4075,4078,4082,4085,4089,4092,4095,4096,4102,4109,4116,4123,4130,4136,4143,4150,4157,4164,4171,4177,4184,4191,4198,4205,4212,4218,4225,4232,4239,4246,4253,4259,4266,4273,4280,4287,4293,4300,4307,4314,4321,4328,4334,4341,4348,4355,4362,4369,4375,4382,4389,4396,4403,4410,4416,4423,4430,4437,4444,4450,4457,4464,4471,4478,4485,4491,4498,4505,4512,4519,4526,4532,4539,4546,4553,4560,4567,4573,4580,4587,4594,4601,4607,4608,4614,4621,4628,4635,4642,4648,4655,4662,4669,4676,4683,4689,4696,4703,4710,4717,4724,4730,4737,4744,4751,4758,4765,4771,4778,4785,4792,4799,4805,4812,4819,4826,4833,4840,4846,4853,4860,4867,4874,4881,4887,4894,4901,4908,4915,4922,4928,4935,4942,4949,4956,4962,4969,4976,4983,4990,4997,5003,5010,5017,5024,5031,5038,5044,5051,5058,5065,5072,5079,5085,5092,5099,5106,5113,5119,5120,5126,5133,5140,5147,5154,5160,5167,5174,5181,5188,5195,5201,5208,5215,5222,5229,5236,5242,5249,5256,5263,5270,5277,5283,5290,5297,5304,5311,5317,5324,5331,5338,5345,5352,5358,5365,5372,5379,5386,5393,5399,5406,5413,5420,5427,5434,5440,5447,5454,5461,5468,5474,5481,5488,5495,5502,5509,5515,5522,5529,5536,5543,5550,5556,5563,5570,5577,5584,5591,5597,5604,5611,5618,5625,5631,5632,5638,5645,5652,5659,5666,5672,5679,5686,5693,5700,5707,5713,5720,5727,5734,5741,5748,5754,5761,5768,5775,5782,5789,5795,5802,5809,5816,5823,5829,5836,5843,5850,5857,5864,5870,5877,5884,5891,5898,5905,5911,5918,5925,5932,5939,5946,5952,5959,5966,5973,5980,5986,5993,6000,6007,6014,6021,6027,6034,6041,6048,6055,6062,6068,6075,6082,6089,6096,6103,6109,6116,6123,6130,6137,6143,6144,6150,6157,6164,6171,6178,6184,6191,6198,6205,6212,6219,6225,6232,6239,6246,6253,6260,6266,6273,6280,6287,6294,6301,6307,6314,6321,6328,6335,6341,6348,6355,6362,6369,6376,6382,6389,6396,6403,6410,6417,6423,6430,6437,6444,6451,6458,6464,6471,6478,6485,6492,6498,6505,6512,6519,6526,6533,6539,6546,6553,6560,6567,6574,6580,6587,6594,6601,6608,6615,6621,6628,6635,6642,6649,6655,6656,6662,6669,6676,6683,6690,6696,6703,6710,6717,6724,6731,6737,6744,6751,6758,6765,6772,6778,6785,6792,6799,6806,6813,6819,6826,6833,6840,6847,6853,6860,6867,6874,6881,6888,6894,6901,6908,6915,6922,6929,6935,6942,6949,6956,6963,6970,6976,6983,6990,6997,7004,7010,7017,7024,7031,7038,7045,7051,7058,7065,7072,7079,7086,7092,7099,7106,7113,7120,7127,7133,7140,7147,7154,7161,7167,7168,7174,7181,7188,7195,7202,7208,7215,7222,7229,7236,7243,7249,7256,7263,7270,7277,7284,7290,7297,7304,7311,7318,7325,7331,7338,7345,7352,7359,7365,7372,7379,7386,7393,7400,7406,7413,7420,7427,7434,7441,7447,7454,7461,7468,7475,7482,7488,7495,7502,7509,7516,7522,7529,7536,7543,7550,7557,7563,7570,7577,7584,7591,7598,7604,7611,7618,7625,7632,7639,7645,7652,7659,7666,7673,7680,7686,7693,7700,7707,7714,7720,7727,7734,7741,7748,7755,7761,7768,7775,7782,7789,7796,7802,7809,7816,7823,7830,7837,7843,7850,7857,7864,7871,7877,7884,7891,7898,7905,7912,7918,7925,7932,7939,7946,7953,7959,7966,7973,7980,7987,7994,8000,8007,8014,8021,8028,8034,8041,8048,8055,8062,8069,8075,8082,8089,8096,8103,8110,8116,8123,8130,8137,8144,8151,8157,8164,8171,8178,8185,8191,8192,8205,8219,8232,8246,8260,8273,8287,8301,8314,8328,8342,8355,8369,8383,8396,8410,8424,8437,8451,8465,8478,8492,8506,8519,8533,8546,8560,8574,8587,8601,8615,8628,8642,8656,8669,8683,8697,8710,8724,8738,8751,8765,8779,8792,8806,8820,8833,8847,8861,8874,8888,8901,8915,8929,8942,8956,8970,8983,8997,9011,9024,9038,9052,9065,9079,9093,9106,9120,9134,9147,9161,9175,9188,9202,9215,9216,9229,9243,9256,9270,9284,9297,9311,9325,9338,9352,9366,9379,9393,9407,9420,9434,9448,9461,9475,9489,9502,9516,9530,9543,9557,9570,9584,9598,9611,9625,9639,9652,9666,9680,9693,9707,9721,9734,9748,9762,9775,9789,9803,9816,9830,9844,9857,9871,9885,9898,9912,9925,9939,9953,9966,9980,9994,10007,10021,10035,10048,10062,10076,10089,10103,10117,10130,10144,10158,10171,10185,10199,10212,10226,10239,10240,10253,10267,10280,10294,10308,10321,10335,10349,10362,10376,10390,10403,10417,10431,10444,10458,10472,10485,10499,10513,10526,10540,10554,10567,10581,10594,10608,10622,10635,10649,10663,10676,10690,10704,10717,10731,10745,10758,10772,10786,10799,10813,10827,10840,10854,10868,10881,10895,10909,10922,10936,10949,10963,10977,10990,11004,11018,11031,11045,11059,11072,11086,11100,11113,11127,11141,11154,11168,11182,11195,11209,11223,11236,11250,11263,11264,11277,11291,11304,11318,11332,11345,11359,11373,11386,11400,11414,11427,11441,11455,11468,11482,11496,11509,11523,11537,11550,11564,11578,11591,11605,11618,11632,11646,11659,11673,11687,11700,11714,11728,11741,11755,11769,11782,11796,11810,11823,11837,11851,11864,11878,11892,11905,11919,11933,11946,11960,11973,11987,12001,12014,12028,12042,12055,12069,12083,12096,12110,12124,12137,12151,12165,12178,12192,12206,12219,12233,12247,12260,12274,12287,12288,12301,12315,12328,12342,12356,12369,12383,12397,12410,12424,12438,12451,12465,12479,12492,12506,12520,12533,12547,12561,12574,12588,12602,12615,12629,12642,12656,12670,12683,12697,12711,12724,12738,12752,12765,12779,12793,12806,12820,12834,12847,12861,12875,12888,12902,12916,12929,12943,12957,12970,12984,12997,13011,13025,13038,13052,13066,13079,13093,13107,13120,13134,13148,13161,13175,13189,13202,13216,13230,13243,13257,13271,13284,13298,13311,13312,13325,13339,13352,13366,13380,13393,13407,13421,13434,13448,13462,13475,13489,13503,13516,13530,13544,13557,13571,13585,13598,13612,13626,13639,13653,13666,13680,13694,13707,13721,13735,13748,13762,13776,13789,13803,13817,13830,13844,13858,13871,13885,13899,13912,13926,13940,13953,13967,13981,13994,14008,14021,14035,14049,14062,14076,14090,14103,14117,14131,14144,14158,14172,14185,14199,14213,14226,14240,14254,14267,14281,14295,14308,14322,14335,14336,14349,14363,14376,14390,14404,14417,14431,14445,14458,14472,14486,14499,14513,14527,14540,14554,14568,14581,14595,14609,14622,14636,14650,14663,14677,14690,14704,14718,14731,14745,14759,14772,14786,14800,14813,14827,14841,14854,14868,14882,14895,14909,14923,14936,14950,14964,14977,14991,15005,15018,15032,15045,15059,15073,15086,15100,15114,15127,15141,15155,15168,15182,15196,15209,15223,15237,15250,15264,15278,15291,15305,15319,15332,15346,15360,15373,15387,15400,15414,15428,15441,15455,15469,15482,15496,15510,15523,15537,15551,15564,15578,15592,15605,15619,15633,15646,15660,15674,15687,15701,15714,15728,15742,15755,15769,15783,15796,15810,15824,15837,15851,15865,15878,15892,15906,15919,15933,15947,15960,15974,15988,16001,16015,16029,16042,16056,16069,16083,16097,16110,16124,16138,16151,16165,16179,16192,16206,16220,16233,16247,16261,16274,16288,16302,16315,16329,16343,16356,16370,16383,16384,16411,16438,16465,16493,16520,16547,16575,16602,16629,16657,16684,16711,16738,16766,16793,16820,16848,16875,16902,16930,16957,16984,17012,17039,17066,17093,17121,17148,17175,17203,17230,17257,17285,17312,17339,17367,17394,17421,17448,17476,17503,17530,17558,17585,17612,17640,17667,17694,17722,17749,17776,17803,17831,17858,17885,17913,17940,17967,17995,18022,18049,18077,18104,18131,18158,18186,18213,18240,18268,18295,18322,18350,18377,18404,18431,18432,18459,18486,18513,18541,18568,18595,18623,18650,18677,18705,18732,18759,18786,18814,18841,18868,18896,18923,18950,18978,19005,19032,19060,19087,19114,19141,19169,19196,19223,19251,19278,19305,19333,19360,19387,19415,19442,19469,19496,19524,19551,19578,19606,19633,19660,19688,19715,19742,19770,19797,19824,19851,19879,19906,19933,19961,19988,20015,20043,20070,20097,20125,20152,20179,20206,20234,20261,20288,20316,20343,20370,20398,20425,20452,20479,20480,20507,20534,20561,20589,20616,20643,20671,20698,20725,20753,20780,20807,20834,20862,20889,20916,20944,20971,20998,21026,21053,21080,21108,21135,21162,21189,21217,21244,21271,21299,21326,21353,21381,21408,21435,21463,21490,21517,21544,21572,21599,21626,21654,21681,21708,21736,21763,21790,21818,21845,21872,21899,21927,21954,21981,22009,22036,22063,22091,22118,22145,22173,22200,22227,22254,22282,22309,22336,22364,22391,22418,22446,22473,22500,22527,22528,22555,22582,22609,22637,22664,22691,22719,22746,22773,22801,22828,22855,22882,22910,22937,22964,22992,23019,23046,23074,23101,23128,23156,23183,23210,23237,23265,23292,23319,23347,23374,23401,23429,23456,23483,23511,23538,23565,23592,23620,23647,23674,23702,23729,23756,23784,23811,23838,23866,23893,23920,23947,23975,24002,24029,24057,24084,24111,24139,24166,24193,24221,24248,24275,24302,24330,24357,24384,24412,24439,24466,24494,24521,24548,24575,24576,24603,24630,24657,24685,24712,24739,24767,24794,24821,24849,24876,24903,24930,24958,24985,25012,25040,25067,25094,25122,25149,25176,25204,25231,25258,25285,25313,25340,25367,25395,25422,25449,25477,25504,25531,25559,25586,25613,25640,25668,25695,25722,25750,25777,25804,25832,25859,25886,25914,25941,25968,25995,26023,26050,26077,26105,26132,26159,26187,26214,26241,26269,26296,26323,26350,26378,26405,26432,26460,26487,26514,26542,26569,26596,26623,26624,26651,26678,26705,26733,26760,26787,26815,26842,26869,26897,26924,26951,26978,27006,27033,27060,27088,27115,27142,27170,27197,27224,27252,27279,27306,27333,27361,27388,27415,27443,27470,27497,27525,27552,27579,27607,27634,27661,27688,27716,27743,27770,27798,27825,27852,27880,27907,27934,27962,27989,28016,28043,28071,28098,28125,28153,28180,28207,28235,28262,28289,28317,28344,28371,28398,28426,28453,28480,28508,28535,28562,28590,28617,28644,28671,28672,28699,28726,28753,28781,28808,28835,28863,28890,28917,28945,28972,28999,29026,29054,29081,29108,29136,29163,29190,29218,29245,29272,29300,29327,29354,29381,29409,29436,29463,29491,29518,29545,29573,29600,29627,29655,29682,29709,29736,29764,29791,29818,29846,29873,29900,29928,29955,29982,30010,30037,30064,30091,30119,30146,30173,30201,30228,30255,30283,30310,30337,30365,30392,30419,30446,30474,30501,30528,30556,30583,30610,30638,30665,30692,30720,30747,30774,30801,30829,30856,30883,30911,30938,30965,30993,31020,31047,31074,31102,31129,31156,31184,31211,31238,31266,31293,31320,31348,31375,31402,31429,31457,31484,31511,31539,31566,31593,31621,31648,31675,31703,31730,31757,31784,31812,31839,31866,31894,31921,31948,31976,32003,32030,32058,32085,32112,32139,32167,32194,32221,32249,32276,32303,32331,32358,32385,32413,32440,32467,32494,32522,32549,32576,32604,32631,32658,32686,32713,32740,32767,32768,32822,32877,32931,32986,33041,33095,33150,33204,33259,33314,33368,33423,33477,33532,33587,33641,33696,33751,33805,33860,33914,33969,34024,34078,34133,34187,34242,34297,34351,34406,34461,34515,34570,34624,34679,34734,34788,34843,34897,34952,35007,35061,35116,35170,35225,35280,35334,35389,35444,35498,35553,35607,35662,35717,35771,35826,35880,35935,35990,36044,36099,36154,36208,36263,36317,36372,36427,36481,36536,36590,36645,36700,36754,36809,36863,36864,36918,36973,37027,37082,37137,37191,37246,37300,37355,37410,37464,37519,37573,37628,37683,37737,37792,37847,37901,37956,38010,38065,38120,38174,38229,38283,38338,38393,38447,38502,38557,38611,38666,38720,38775,38830,38884,38939,38993,39048,39103,39157,39212,39266,39321,39376,39430,39485,39540,39594,39649,39703,39758,39813,39867,39922,39976,40031,40086,40140,40195,40250,40304,40359,40413,40468,40523,40577,40632,40686,40741,40796,40850,40905,40959,40960,41014,41069,41123,41178,41233,41287,41342,41396,41451,41506,41560,41615,41669,41724,41779,41833,41888,41943,41997,42052,42106,42161,42216,42270,42325,42379,42434,42489,42543,42598,42653,42707,42762,42816,42871,42926,42980,43035,43089,43144,43199,43253,43308,43362,43417,43472,43526,43581,43636,43690,43745,43799,43854,43909,43963,44018,44072,44127,44182,44236,44291,44346,44400,44455,44509,44564,44619,44673,44728,44782,44837,44892,44946,45001,45055,45056,45110,45165,45219,45274,45329,45383,45438,45492,45547,45602,45656,45711,45765,45820,45875,45929,45984,46039,46093,46148,46202,46257,46312,46366,46421,46475,46530,46585,46639,46694,46749,46803,46858,46912,46967,47022,47076,47131,47185,47240,47295,47349,47404,47458,47513,47568,47622,47677,47732,47786,47841,47895,47950,48005,48059,48114,48168,48223,48278,48332,48387,48442,48496,48551,48605,48660,48715,48769,48824,48878,48933,48988,49042,49097,49151,49152,49206,49261,49315,49370,49425,49479,49534,49588,49643,49698,49752,49807,49861,49916,49971,50025,50080,50135,50189,50244,50298,50353,50408,50462,50517,50571,50626,50681,50735,50790,50845,50899,50954,51008,51063,51118,51172,51227,51281,51336,51391,51445,51500,51554,51609,51664,51718,51773,51828,51882,51937,51991,52046,52101,52155,52210,52264,52319,52374,52428,52483,52538,52592,52647,52701,52756,52811,52865,52920,52974,53029,53084,53138,53193,53247,53248,53302,53357,53411,53466,53521,53575,53630,53684,53739,53794,53848,53903,53957,54012,54067,54121,54176,54231,54285,54340,54394,54449,54504,54558,54613,54667,54722,54777,54831,54886,54941,54995,55050,55104,55159,55214,55268,55323,55377,55432,55487,55541,55596,55650,55705,55760,55814,55869,55924,55978,56033,56087,56142,56197,56251,56306,56360,56415,56470,56524,56579,56634,56688,56743,56797,56852,56907,56961,57016,57070,57125,57180,57234,57289,57343,57344,57398,57453,57507,57562,57617,57671,57726,57780,57835,57890,57944,57999,58053,58108,58163,58217,58272,58327,58381,58436,58490,58545,58600,58654,58709,58763,58818,58873,58927,58982,59037,59091,59146,59200,59255,59310,59364,59419,59473,59528,59583,59637,59692,59746,59801,59856,59910,59965,60020,60074,60129,60183,60238,60293,60347,60402,60456,60511,60566,60620,60675,60730,60784,60839,60893,60948,61003,61057,61112,61166,61221,61276,61330,61385,61440,61494,61549,61603,61658,61713,61767,61822,61876,61931,61986,62040,62095,62149,62204,62259,62313,62368,62423,62477,62532,62586,62641,62696,62750,62805,62859,62914,62969,63023,63078,63133,63187,63242,63296,63351,63406,63460,63515,63569,63624,63679,63733,63788,63842,63897,63952,64006,64061,64116,64170,64225,64279,64334,64389,64443,64498,64552,64607,64662,64716,64771,64826,64880,64935,64989,65044,65099,65153,65208,65262,65317,65372,65426,65481,65535,65536,65645,65754,65863,65972,66082,66191,66300,66409,66519,66628,66737,66846,66955,67065,67174,67283,67392,67502,67611,67720,67829,67938,68048,68157,68266,68375,68485,68594,68703,68812,68922,69031,69140,69249,69358,69468,69577,69686,69795,69905,70014,70123,70232,70341,70451,70560,70669,70778,70888,70997,71106,71215,71325,71434,71543,71652,71761,71871,71980,72089,72198,72308,72417,72526,72635,72744,72854,72963,73072,73181,73291,73400,73509,73618,73727,73728,73837,73946,74055,74164,74274,74383,74492,74601,74711,74820,74929,75038,75147,75257,75366,75475,75584,75694,75803,75912,76021,76130,76240,76349,76458,76567,76677,76786,76895,77004,77114,77223,77332,77441,77550,77660,77769,77878,77987,78097,78206,78315,78424,78533,78643,78752,78861,78970,79080,79189,79298,79407,79517,79626,79735,79844,79953,80063,80172,80281,80390,80500,80609,80718,80827,80936,81046,81155,81264,81373,81483,81592,81701,81810,81919,81920,82029,82138,82247,82356,82466,82575,82684,82793,82903,83012,83121,83230,83339,83449,83558,83667,83776,83886,83995,84104,84213,84322,84432,84541,84650,84759,84869,84978,85087,85196,85306,85415,85524,85633,85742,85852,85961,86070,86179,86289,86398,86507,86616,86725,86835,86944,87053,87162,87272,87381,87490,87599,87709,87818,87927,88036,88145,88255,88364,88473,88582,88692,88801,88910,89019,89128,89238,89347,89456,89565,89675,89784,89893,90002,90111,90112,90221,90330,90439,90548,90658,90767,90876,90985,91095,91204,91313,91422,91531,91641,91750,91859,91968,92078,92187,92296,92405,92514,92624,92733,92842,92951,93061,93170,93279,93388,93498,93607,93716,93825,93934,94044,94153,94262,94371,94481,94590,94699,94808,94917,95027,95136,95245,95354,95464,95573,95682,95791,95901,96010,96119,96228,96337,96447,96556,96665,96774,96884,96993,97102,97211,97320,97430,97539,97648,97757,97867,97976,98085,98194,98303,98304,98413,98522,98631,98740,98850,98959,99068,99177,99287,99396,99505,99614,99723,99833,99942,100051,100160,100270,100379,100488,100597,100706,100816,100925,101034,101143,101253,101362,101471,101580,101690,101799,101908,102017,102126,102236,102345,102454,102563,102673,102782,102891,103000,103109,103219,103328,103437,103546,103656,103765,103874,103983,104093,104202,104311,104420,104529,104639,104748,104857,104966,105076,105185,105294,105403,105512,105622,105731,105840,105949,106059,106168,106277,106386,106495,106496,106605,106714,106823,106932,107042,107151,107260,107369,107479,107588,107697,107806,107915,108025,108134,108243,108352,108462,108571,108680,108789,108898,109008,109117,109226,109335,109445,109554,109663,109772,109882,109991,110100,110209,110318,110428,110537,110646,110755,110865,110974,111083,111192,111301,111411,111520,111629,111738,111848,111957,112066,112175,112285,112394,112503,112612,112721,112831,112940,113049,113158,113268,113377,113486,113595,113704,113814,113923,114032,114141,114251,114360,114469,114578,114687,114688,114797,114906,115015,115124,115234,115343,115452,115561,115671,115780,115889,115998,116107,116217,116326,116435,116544,116654,116763,116872,116981,117090,117200,117309,117418,117527,117637,117746,117855,117964,118074,118183,118292,118401,118510,118620,118729,118838,118947,119057,119166,119275,119384,119493,119603,119712,119821,119930,120040,120149,120258,120367,120477,120586,120695,120804,120913,121023,121132,121241,121350,121460,121569,121678,121787,121896,122006,122115,122224,122333,122443,122552,122661,122770,122880,122989,123098,123207,123316,123426,123535,123644,123753,123863,123972,124081,124190,124299,124409,124518,124627,124736,124846,124955,125064,125173,125282,125392,125501,125610,125719,125829,125938,126047,126156,126266,126375,126484,126593,126702,126812,126921,127030,127139,127249,127358,127467,127576,127685,127795,127904,128013,128122,128232,128341,128450,128559,128669,128778,128887,128996,129105,129215,129324,129433,129542,129652,129761,129870,129979,130088,130198,130307,130416,130525,130635,130744,130853,130962,131071,131072,131290,131508,131727,131945,132164,132382,132601,132819,133038,133256,133474,133475,133693,133911,134130,134348,134567,134785,135004,135222,135441,135659,135877,136096,136314,136533,136751,136970,137188,137407,137625,137844,138062,138280,138499,138717,138936,139154,139373,139591,139810,140028,140247,140465,140683,140902,141120,141339,141557,141776,141994,142213,142431,142650,142868,143086,143305,143523,143742,143960,144179,144397,144616,144834,145053,145271,145489,145708,145926,146145,146363,146582,146800,147019,147237,147455,147456,147674,147892,148111,148329,148548,148766,148985,149203,149422,149640,149858,149859,150077,150295,150514,150732,150951,151169,151388,151606,151825,152043,152261,152480,152698,152917,153135,153354,153572,153791,154009,154228,154446,154664,154883,155101,155320,155538,155757,155975,156194,156412,156631,156849,157067,157286,157504,157723,157941,158160,158378,158597,158815,159034,159252,159470,159689,159907,160126,160344,160563,160781,161000,161218,161437,161655,161873,162092,162310,162529,162747,162966,163184,163403,163621,163839,163840,164058,164276,164495,164713,164932,165150,165369,165587,165806,166024,166242,166243,166461,166679,166898,167116,167335,167553,167772,167990,168209,168427,168645,168864,169082,169301,169519,169738,169956,170175,170393,170612,170830,171048,171267,171485,171704,171922,172141,172359,172578,172796,173015,173233,173451,173670,173888,174107,174325,174544,174762,174981,175199,175418,175636,175854,176073,176291,176510,176728,176947,177165,177384,177602,177821,178039,178257,178476,178694,178913,179131,179350,179568,179787,180005,180223,180224,180442,180660,180879,181097,181316,181534,181753,181971,182190,182408,182626,182627,182845,183063,183282,183500,183719,183937,184156,184374,184593,184811,185029,185248,185466,185685,185903,186122,186340,186559,186777,186996,187214,187432,187651,187869,188088,188306,188525,188743,188962,189180,189399,189617,189835,190054,190272,190491,190709,190928,191146,191365,191583,191802,192020,192238,192457,192675,192894,193112,193331,193549,193768,193986,194205,194423,194641,194860,195078,195297,195515,195734,195952,196171,196389,196607,196608,196826,197044,197263,197481,197700,197918,198137,198355,198574,198792,199010,199011,199229,199447,199666,199884,200103,200321,200540,200758,200977,201195,201413,201632,201850,202069,202287,202506,202724,202943,203161,203380,203598,203816,204035,204253,204472,204690,204909,205127,205346,205564,205783,206001,206219,206438,206656,206875,207093,207312,207530,207749,207967,208186,208404,208622,208841,209059,209278,209496,209715,209933,210152,210370,210589,210807,211025,211244,211462,211681,211899,212118,212336,212555,212773,212991,212992,213210,213428,213647,213865,214084,214302,214521,214739,214958,215176,215394,215395,215613,215831,216050,216268,216487,216705,216924,217142,217361,217579,217797,218016,218234,218453,218671,218890,219108,219327,219545,219764,219982,220200,220419,220637,220856,221074,221293,221511,221730,221948,222167,222385,222603,222822,223040,223259,223477,223696,223914,224133,224351,224570,224788,225006,225225,225443,225662,225880,226099,226317,226536,226754,226973,227191,227409,227628,227846,228065,228283,228502,228720,228939,229157,229375,229376,229594,229812,230031,230249,230468,230686,230905,231123,231342,231560,231778,231779,231997,232215,232434,232652,232871,233089,233308,233526,233745,233963,234181,234400,234618,234837,235055,235274,235492,235711,235929,236148,236366,236584,236803,237021,237240,237458,237677,237895,238114,238332,238551,238769,238987,239206,239424,239643,239861,240080,240298,240517,240735,240954,241172,241390,241609,241827,242046,242264,242483,242701,242920,243138,243357,243575,243793,244012,244230,244449,244667,244886,245104,245323,245541,245760,245978,246196,246415,246633,246852,247070,247289,247507,247726,247944,248162,248163,248381,248599,248818,249036,249255,249473,249692,249910,250129,250347,250565,250784,251002,251221,251439,251658,251876,252095,252313,252532,252750,252968,253187,253405,253624,253842,254061,254279,254498,254716,254935,255153,255371,255590,255808,256027,256245,256464,256682,256901,257119,257338,257556,257774,257993,258211,258430,258648,258867,259085,259304,259522,259741,259959,260177,260396,260614,260833,261051,261270,261488,261707,261925,262143,262144,262580,263017,263454,263891,264328,264765,265202,265639,266076,266513,266949,266950,267386,267823,268260,268697,269134,269571,270008,270445,270882,271319,271755,272192,272629,273066,273503,273940,274377,274814,275251,275688,276125,276561,276998,277435,277872,278309,278746,279183,279620,280057,280494,280930,280931,281367,281804,282241,282678,283115,283552,283989,284426,284863,285300,285736,286173,286610,287047,287484,287921,288358,288795,289232,289669,290106,290542,290979,291416,291853,292290,292727,293164,293601,294038,294475,294911,294912,295348,295785,296222,296659,297096,297533,297970,298407,298844,299281,299717,299718,300154,300591,301028,301465,301902,302339,302776,303213,303650,304087,304523,304960,305397,305834,306271,306708,307145,307582,308019,308456,308893,309329,309766,310203,310640,311077,311514,311951,312388,312825,313262,313698,313699,314135,314572,315009,315446,315883,316320,316757,317194,317631,318068,318504,318941,319378,319815,320252,320689,321126,321563,322000,322437,322874,323310,323747,324184,324621,325058,325495,325932,326369,326806,327243,327679,327680,328116,328553,328990,329427,329864,330301,330738,331175,331612,332049,332485,332486,332922,333359,333796,334233,334670,335107,335544,335981,336418,336855,337291,337728,338165,338602,339039,339476,339913,340350,340787,341224,341661,342097,342534,342971,343408,343845,344282,344719,345156,345593,346030,346466,346467,346903,347340,347777,348214,348651,349088,349525,349962,350399,350836,351272,351709,352146,352583,353020,353457,353894,354331,354768,355205,355642,356078,356515,356952,357389,357826,358263,358700,359137,359574,360011,360447,360448,360884,361321,361758,362195,362632,363069,363506,363943,364380,364817,365253,365254,365690,366127,366564,367001,367438,367875,368312,368749,369186,369623,370059,370496,370933,371370,371807,372244,372681,373118,373555,373992,374429,374865,375302,375739,376176,376613,377050,377487,377924,378361,378798,379234,379235,379671,380108,380545,380982,381419,381856,382293,382730,383167,383604,384040,384477,384914,385351,385788,386225,386662,387099,387536,387973,388410,388846,389283,389720,390157,390594,391031,391468,391905,392342,392779,393215,393216,393652,394089,394526,394963,395400,395837,396274,396711,397148,397585,398021,398022,398458,398895,399332,399769,400206,400643,401080,401517,401954,402391,402827,403264,403701,404138,404575,405012,405449,405886,406323,406760,407197,407633,408070,408507,408944,409381,409818,410255,410692,411129,411566,412002,412003,412439,412876,413313,413750,414187,414624,415061,415498,415935,416372,416808,417245,417682,418119,418556,418993,419430,419867,420304,420741,421178,421614,422051,422488,422925,423362,423799,424236,424673,425110,425547,425983,425984,426420,426857,427294,427731,428168,428605,429042,429479,429916,430353,430789,430790,431226,431663,432100,432537,432974,433411,433848,434285,434722,435159,435595,436032,436469,436906,437343,437780,438217,438654,439091,439528,439965,440401,440838,441275,441712,442149,442586,443023,443460,443897,444334,444770,444771,445207,445644,446081,446518,446955,447392,447829,448266,448703,449140,449576,450013,450450,450887,451324,451761,452198,452635,453072,453509,453946,454382,454819,455256,455693,456130,456567,457004,457441,457878,458315,458751,458752,459188,459625,460062,460499,460936,461373,461810,462247,462684,463121,463557,463558,463994,464431,464868,465305,465742,466179,466616,467053,467490,467927,468363,468800,469237,469674,470111,470548,470985,471422,471859,472296,472733,473169,473606,474043,474480,474917,475354,475791,476228,476665,477102,477538,477539,477975,478412,478849,479286,479723,480160,480597,481034,481471,481908,482344,482781,483218,483655,484092,484529,484966,485403,485840,486277,486714,487150,487587,488024,488461,488898,489335,489772,490209,490646,491083,491520,491956,492393,492830,493267,493704,494141,494578,495015,495452,495889,496325,496326,496762,497199,497636,498073,498510,498947,499384,499821,500258,500695,501131,501568,502005,502442,502879,503316,503753,504190,504627,505064,505501,505937,506374,506811,507248,507685,508122,508559,508996,509433,509870,510306,510307,510743,511180,511617,512054,512491,512928,513365,513802,514239,514676,515112,515549,515986,516423,516860,517297,517734,518171,518608,519045,519482,519918,520355,520792,521229,521666,522103,522540,522977,523414,523851,524287,524288,525161,526035,526909,527783,528657,529530,530404,531278,532152,533026,533899,533900,534773,535647,536521,537395,538269,539142,540016,540890,541764,542638,543511,544385,545259,546133,547007,547880,547881,548754,549628,550502,551376,552250,553123,553997,554871,555745,556619,557492,558366,559240,560114,560988,561861,561862,562735,563609,564483,565357,566231,567104,567978,568852,569726,570600,571473,572347,573221,574095,574969,575842,575843,576716,577590,578464,579338,580212,581085,581959,582833,583707,584581,585454,586328,587202,588076,588950,589823,589824,590697,591571,592445,593319,594193,595066,595940,596814,597688,598562,599435,599436,600309,601183,602057,602931,603805,604678,605552,606426,607300,608174,609047,609921,610795,611669,612543,613416,613417,614290,615164,616038,616912,617786,618659,619533,620407,621281,622155,623028,623902,624776,625650,626524,627397,627398,628271,629145,630019,630893,631767,632640,633514,634388,635262,636136,637009,637883,638757,639631,640505,641378,641379,642252,643126,644000,644874,645748,646621,647495,648369,649243,650117,650990,651864,652738,653612,654486,655359,655360,656233,657107,657981,658855,659729,660602,661476,662350,663224,664098,664971,664972,665845,666719,667593,668467,669341,670214,671088,671962,672836,673710,674583,675457,676331,677205,678079,678952,678953,679826,680700,681574,682448,683322,684195,685069,685943,686817,687691,688564,689438,690312,691186,692060,692933,692934,693807,694681,695555,696429,697303,698176,699050,699924,700798,701672,702545,703419,704293,705167,706041,706914,706915,707788,708662,709536,710410,711284,712157,713031,713905,714779,715653,716526,717400,718274,719148,720022,720895,720896,721769,722643,723517,724391,725265,726138,727012,727886,728760,729634,730507,730508,731381,732255,733129,734003,734877,735750,736624,737498,738372,739246,740119,740993,741867,742741,743615,744488,744489,745362,746236,747110,747984,748858,749731,750605,751479,752353,753227,754100,754974,755848,756722,757596,758469,758470,759343,760217,761091,761965,762839,763712,764586,765460,766334,767208,768081,768955,769829,770703,771577,772450,772451,773324,774198,775072,775946,776820,777693,778567,779441,780315,781189,782062,782936,783810,784684,785558,786431,786432,787305,788179,789053,789927,790801,791674,792548,793422,794296,795170,796043,796044,796917,797791,798665,799539,800413,801286,802160,803034,803908,804782,805655,806529,807403,808277,809151,810024,810025,810898,811772,812646,813520,814394,815267,816141,817015,817889,818763,819636,820510,821384,822258,823132,824005,824006,824879,825753,826627,827501,828375,829248,830122,830996,831870,832744,833617,834491,835365,836239,837113,837986,837987,838860,839734,840608,841482,842356,843229,844103,844977,845851,846725,847598,848472,849346,850220,851094,851967,851968,852841,853715,854589,855463,856337,857210,858084,858958,859832,860706,861579,861580,862453,863327,864201,865075,865949,866822,867696,868570,869444,870318,871191,872065,872939,873813,874687,875560,875561,876434,877308,878182,879056,879930,880803,881677,882551,883425,884299,885172,886046,886920,887794,888668,889541,889542,890415,891289,892163,893037,893911,894784,895658,896532,897406,898280,899153,900027,900901,901775,902649,903522,903523,904396,905270,906144,907018,907892,908765,909639,910513,911387,912261,913134,914008,914882,915756,916630,917503,917504,918377,919251,920125,920999,921873,922746,923620,924494,925368,926242,927115,927116,927989,928863,929737,930611,931485,932358,933232,934106,934980,935854,936727,937601,938475,939349,940223,941096,941097,941970,942844,943718,944592,945466,946339,947213,948087,948961,949835,950708,951582,952456,953330,954204,955077,955078,955951,956825,957699,958573,959447,960320,961194,962068,962942,963816,964689,965563,966437,967311,968185,969058,969059,969932,970806,971680,972554,973428,974301,975175,976049,976923,977797,978670,979544,980418,981292,982166,983040,983913,984787,985661,986535,987409,988282,989156,990030,990904,991778,992651,992652,993525,994399,995273,996147,997021,997894,998768,999642,1000516,1001390,1002263,1003137,1004011,1004885,1005759,1006632,1006633,1007506,1008380,1009254,1010128,1011002,1011875,1012749,1013623,1014497,1015371,1016244,1017118,1017992,1018866,1019740,1020613,1020614,1021487,1022361,1023235,1024109,1024983,1025856,1026730,1027604,1028478,1029352,1030225,1031099,1031973,1032847,1033721,1034594,1034595,1035468,1036342,1037216,1038090,1038964,1039837,1040711,1041585,1042459,1043333,1044206,1045080,1045954,1046828,1047702,1048575,1048576,1050323,1052071,1053818,1053819,1055566,1057314,1059061,1060809,1062557,1064304,1066052,1067799,1067800,1069547,1071295,1073042,1074790,1076538,1078285,1080033,1081780,1081781,1083528,1085276,1087023,1088771,1090519,1092266,1094014,1095761,1095762,1097509,1099257,1101004,1102752,1104500,1106247,1107995,1109742,1109743,1111490,1113238,1114985,1116733,1118481,1120228,1121976,1123723,1123724,1125471,1127219,1128966,1130714,1132462,1134209,1135957,1137704,1137705,1139452,1141200,1142947,1144695,1146443,1148190,1149938,1151685,1151686,1153433,1155181,1156928,1158676,1160424,1162171,1163919,1165666,1165667,1167414,1169162,1170909,1172657,1174405,1176152,1177900,1179647,1179648,1181395,1183143,1184890,1184891,1186638,1188386,1190133,1191881,1193629,1195376,1197124,1198871,1198872,1200619,1202367,1204114,1205862,1207610,1209357,1211105,1212852,1212853,1214600,1216348,1218095,1219843,1221591,1223338,1225086,1226833,1226834,1228581,1230329,1232076,1233824,1235572,1237319,1239067,1240814,1240815,1242562,1244310,1246057,1247805,1249553,1251300,1253048,1254795,1254796,1256543,1258291,1260038,1261786,1263534,1265281,1267029,1268776,1268777,1270524,1272272,1274019,1275767,1277515,1279262,1281010,1282757,1282758,1284505,1286253,1288000,1289748,1291496,1293243,1294991,1296738,1296739,1298486,1300234,1301981,1303729,1305477,1307224,1308972,1310719,1310720,1312467,1314215,1315962,1315963,1317710,1319458,1321205,1322953,1324701,1326448,1328196,1329943,1329944,1331691,1333439,1335186,1336934,1338682,1340429,1342177,1343924,1343925,1345672,1347420,1349167,1350915,1352663,1354410,1356158,1357905,1357906,1359653,1361401,1363148,1364896,1366644,1368391,1370139,1371886,1371887,1373634,1375382,1377129,1378877,1380625,1382372,1384120,1385867,1385868,1387615,1389363,1391110,1392858,1394606,1396353,1398101,1399848,1399849,1401596,1403344,1405091,1406839,1408587,1410334,1412082,1413829,1413830,1415577,1417325,1419072,1420820,1422568,1424315,1426063,1427810,1427811,1429558,1431306,1433053,1434801,1436549,1438296,1440044,1441791,1441792,1443539,1445287,1447034,1447035,1448782,1450530,1452277,1454025,1455773,1457520,1459268,1461015,1461016,1462763,1464511,1466258,1468006,1469754,1471501,1473249,1474996,1474997,1476744,1478492,1480239,1481987,1483735,1485482,1487230,1488977,1488978,1490725,1492473,1494220,1495968,1497716,1499463,1501211,1502958,1502959,1504706,1506454,1508201,1509949,1511697,1513444,1515192,1516939,1516940,1518687,1520435,1522182,1523930,1525678,1527425,1529173,1530920,1530921,1532668,1534416,1536163,1537911,1539659,1541406,1543154,1544901,1544902,1546649,1548397,1550144,1551892,1553640,1555387,1557135,1558882,1558883,1560630,1562378,1564125,1565873,1567621,1569368,1571116,1572863,1572864,1574611,1576359,1578106,1578107,1579854,1581602,1583349,1585097,1586845,1588592,1590340,1592087,1592088,1593835,1595583,1597330,1599078,1600826,1602573,1604321,1606068,1606069,1607816,1609564,1611311,1613059,1614807,1616554,1618302,1620049,1620050,1621797,1623545,1625292,1627040,1628788,1630535,1632283,1634030,1634031,1635778,1637526,1639273,1641021,1642769,1644516,1646264,1648011,1648012,1649759,1651507,1653254,1655002,1656750,1658497,1660245,1661992,1661993,1663740,1665488,1667235,1668983,1670731,1672478,1674226,1675973,1675974,1677721,1679469,1681216,1682964,1684712,1686459,1688207,1689954,1689955,1691702,1693450,1695197,1696945,1698693,1700440,1702188,1703935,1703936,1705683,1707431,1709178,1709179,1710926,1712674,1714421,1716169,1717917,1719664,1721412,1723159,1723160,1724907,1726655,1728402,1730150,1731898,1733645,1735393,1737140,1737141,1738888,1740636,1742383,1744131,1745879,1747626,1749374,1751121,1751122,1752869,1754617,1756364,1758112,1759860,1761607,1763355,1765102,1765103,1766850,1768598,1770345,1772093,1773841,1775588,1777336,1779083,1779084,1780831,1782579,1784326,1786074,1787822,1789569,1791317,1793064,1793065,1794812,1796560,1798307,1800055,1801803,1803550,1805298,1807045,1807046,1808793,1810541,1812288,1814036,1815784,1817531,1819279,1821026,1821027,1822774,1824522,1826269,1828017,1829765,1831512,1833260,1835007,1835008,1836755,1838503,1840250,1840251,1841998,1843746,1845493,1847241,1848989,1850736,1852484,1854231,1854232,1855979,1857727,1859474,1861222,1862970,1864717,1866465,1868212,1868213,1869960,1871708,1873455,1875203,1876951,1878698,1880446,1882193,1882194,1883941,1885689,1887436,1889184,1890932,1892679,1894427,1896174,1896175,1897922,1899670,1901417,1903165,1904913,1906660,1908408,1910155,1910156,1911903,1913651,1915398,1917146,1918894,1920641,1922389,1924136,1924137,1925884,1927632,1929379,1931127,1932875,1934622,1936370,1938117,1938118,1939865,1941613,1943360,1945108,1946856,1948603,1950351,1952098,1952099,1953846,1955594,1957341,1959089,1960837,1962584,1964332,1966080,1967827,1969575,1971322,1971323,1973070,1974818,1976565,1978313,1980061,1981808,1983556,1985303,1985304,1987051,1988799,1990546,1992294,1994042,1995789,1997537,1999284,1999285,2001032,2002780,2004527,2006275,2008023,2009770,2011518,2013265,2013266,2015013,2016761,2018508,2020256,2022004,2023751,2025499,2027246,2027247,2028994,2030742,2032489,2034237,2035985,2037732,2039480,2041227,2041228,2042975,2044723,2046470,2048218,2049966,2051713,2053461,2055208,2055209,2056956,2058704,2060451,2062199,2063947,2065694,2067442,2069189,2069190,2070937,2072685,2074432,2076180,2077928,2079675,2081423,2083170,2083171,2084918,2086666,2088413,2090161,2091909,2093656,2095404,2097151,2097152,2100647,2104142,2107637,2107638,2111133,2114628,2118123,2121618,2121619,2125114,2128609,2132104,2135599,2135600,2139095,2142590,2146085,2149580,2149581,2153076,2156571,2160066,2163561,2163562,2167057,2170552,2174047,2177542,2177543,2181038,2184533,2188028,2191523,2191524,2195019,2198514,2202009,2205504,2205505,2209000,2212495,2215990,2219485,2219486,2222981,2226476,2229971,2233466,2233467,2236962,2240457,2243952,2247447,2247448,2250943,2254438,2257933,2261428,2261429,2264924,2268419,2271914,2275409,2275410,2278905,2282400,2285895,2289390,2289391,2292886,2296381,2299876,2303371,2303372,2306867,2310362,2313857,2317352,2317353,2320848,2324343,2327838,2331333,2331334,2334829,2338324,2341819,2345314,2345315,2348810,2352305,2355800,2359295,2359296,2362791,2366286,2369781,2369782,2373277,2376772,2380267,2383762,2383763,2387258,2390753,2394248,2397743,2397744,2401239,2404734,2408229,2411724,2411725,2415220,2418715,2422210,2425705,2425706,2429201,2432696,2436191,2439686,2439687,2443182,2446677,2450172,2453667,2453668,2457163,2460658,2464153,2467648,2467649,2471144,2474639,2478134,2481629,2481630,2485125,2488620,2492115,2495610,2495611,2499106,2502601,2506096,2509591,2509592,2513087,2516582,2520077,2523572,2523573,2527068,2530563,2534058,2537553,2537554,2541049,2544544,2548039,2551534,2551535,2555030,2558525,2562020,2565515,2565516,2569011,2572506,2576001,2579496,2579497,2582992,2586487,2589982,2593477,2593478,2596973,2600468,2603963,2607458,2607459,2610954,2614449,2617944,2621439,2621440,2624935,2628430,2631925,2631926,2635421,2638916,2642411,2645906,2645907,2649402,2652897,2656392,2659887,2659888,2663383,2666878,2670373,2673868,2673869,2677364,2680859,2684354,2687849,2687850,2691345,2694840,2698335,2701830,2701831,2705326,2708821,2712316,2715811,2715812,2719307,2722802,2726297,2729792,2729793,2733288,2736783,2740278,2743773,2743774,2747269,2750764,2754259,2757754,2757755,2761250,2764745,2768240,2771735,2771736,2775231,2778726,2782221,2785716,2785717,2789212,2792707,2796202,2799697,2799698,2803193,2806688,2810183,2813678,2813679,2817174,2820669,2824164,2827659,2827660,2831155,2834650,2838145,2841640,2841641,2845136,2848631,2852126,2855621,2855622,2859117,2862612,2866107,2869602,2869603,2873098,2876593,2880088,2883583,2883584,2887079,2890574,2894069,2894070,2897565,2901060,2904555,2908050,2908051,2911546,2915041,2918536,2922031,2922032,2925527,2929022,2932517,2936012,2936013,2939508,2943003,2946498,2949993,2949994,2953489,2956984,2960479,2963974,2963975,2967470,2970965,2974460,2977955,2977956,2981451,2984946,2988441,2991936,2991937,2995432,2998927,3002422,3005917,3005918,3009413,3012908,3016403,3019898,3019899,3023394,3026889,3030384,3033879,3033880,3037375,3040870,3044365,3047860,3047861,3051356,3054851,3058346,3061841,3061842,3065337,3068832,3072327,3075822,3075823,3079318,3082813,3086308,3089803,3089804,3093299,3096794,3100289,3103784,3103785,3107280,3110775,3114270,3117765,3117766,3121261,3124756,3128251,3131746,3131747,3135242,3138737,3142232,3145727,3145728,3149223,3152718,3156213,3156214,3159709,3163204,3166699,3170194,3170195,3173690,3177185,3180680,3184175,3184176,3187671,3191166,3194661,3198156,3198157,3201652,3205147,3208642,3212137,3212138,3215633,3219128,3222623,3226118,3226119,3229614,3233109,3236604,3240099,3240100,3243595,3247090,3250585,3254080,3254081,3257576,3261071,3264566,3268061,3268062,3271557,3275052,3278547,3282042,3282043,3285538,3289033,3292528,3296023,3296024,3299519,3303014,3306509,3310004,3310005,3313500,3316995,3320490,3323985,3323986,3327481,3330976,3334471,3337966,3337967,3341462,3344957,3348452,3351947,3351948,3355443,3358938,3362433,3365928,3365929,3369424,3372919,3376414,3379909,3379910,3383405,3386900,3390395,3393890,3393891,3397386,3400881,3404376,3407871,3407872,3411367,3414862,3418357,3418358,3421853,3425348,3428843,3432338,3432339,3435834,3439329,3442824,3446319,3446320,3449815,3453310,3456805,3460300,3460301,3463796,3467291,3470786,3474281,3474282,3477777,3481272,3484767,3488262,3488263,3491758,3495253,3498748,3502243,3502244,3505739,3509234,3512729,3516224,3516225,3519720,3523215,3526710,3530205,3530206,3533701,3537196,3540691,3544186,3544187,3547682,3551177,3554672,3558167,3558168,3561663,3565158,3568653,3572148,3572149,3575644,3579139,3582634,3586129,3586130,3589625,3593120,3596615,3600110,3600111,3603606,3607101,3610596,3614091,3614092,3617587,3621082,3624577,3628072,3628073,3631568,3635063,3638558,3642053,3642054,3645549,3649044,3652539,3656034,3656035,3659530,3663025,3666520,3670015,3670016,3673511,3677006,3680501,3680502,3683997,3687492,3690987,3694482,3694483,3697978,3701473,3704968,3708463,3708464,3711959,3715454,3718949,3722444,3722445,3725940,3729435,3732930,3736425,3736426,3739921,3743416,3746911,3750406,3750407,3753902,3757397,3760892,3764387,3764388,3767883,3771378,3774873,3778368,3778369,3781864,3785359,3788854,3792349,3792350,3795845,3799340,3802835,3806330,3806331,3809826,3813321,3816816,3820311,3820312,3823807,3827302,3830797,3834292,3834293,3837788,3841283,3844778,3848273,3848274,3851769,3855264,3858759,3862254,3862255,3865750,3869245,3872740,3876235,3876236,3879731,3883226,3886721,3890216,3890217,3893712,3897207,3900702,3904197,3904198,3907693,3911188,3914683,3918178,3918179,3921674,3925169,3928664,3932160,3935655,3939150,3942645,3942646,3946141,3949636,3953131,3956626,3956627,3960122,3963617,3967112,3970607,3970608,3974103,3977598,3981093,3984588,3984589,3988084,3991579,3995074,3998569,3998570,4002065,4005560,4009055,4012550,4012551,4016046,4019541,4023036,4026531,4026532,4030027,4033522,4037017,4040512,4040513,4044008,4047503,4050998,4054493,4054494,4057989,4061484,4064979,4068474,4068475,4071970,4075465,4078960,4082455,4082456,4085951,4089446,4092941,4096436,4096437,4099932,4103427,4106922,4110417,4110418,4113913,4117408,4120903,4124398,4124399,4127894,4131389,4134884,4138379,4138380,4141875,4145370,4148865,4152360,4152361,4155856,4159351,4162846,4166341,4166342,4169837,4173332,4176827,4180322,4180323,4183818,4187313,4190808,4194303,4194304,4201294,4201295,4208285,4215275,4215276,4222266,4229256,4229257,4236247,4243237,4243238,4250228,4257218,4257219,4264209,4271199,4271200,4278190,4285180,4285181,4292171,4299161,4299162,4306152,4313142,4313143,4320133,4327123,4327124,4334114,4341104,4341105,4348095,4355085,4355086,4362076,4369066,4369067,4376057,4383047,4383048,4390038,4397028,4397029,4404019,4411009,4411010,4418000,4424990,4424991,4431981,4438971,4438972,4445962,4452952,4452953,4459943,4466933,4466934,4473924,4480914,4480915,4487905,4494895,4494896,4501886,4508876,4508877,4515867,4522857,4522858,4529848,4536838,4536839,4543829,4550819,4550820,4557810,4564800,4564801,4571791,4578781,4578782,4585772,4592762,4592763,4599753,4606743,4606744,4613734,4620724,4620725,4627715,4634705,4634706,4641696,4648686,4648687,4655677,4662667,4662668,4669658,4676648,4676649,4683639,4690629,4690630,4697620,4704610,4704611,4711601,4718591,4718592,4725582,4725583,4732573,4739563,4739564,4746554,4753544,4753545,4760535,4767525,4767526,4774516,4781506,4781507,4788497,4795487,4795488,4802478,4809468,4809469,4816459,4823449,4823450,4830440,4837430,4837431,4844421,4851411,4851412,4858402,4865392,4865393,4872383,4879373,4879374,4886364,4893354,4893355,4900345,4907335,4907336,4914326,4921316,4921317,4928307,4935297,4935298,4942288,4949278,4949279,4956269,4963259,4963260,4970250,4977240,4977241,4984231,4991221,4991222,4998212,5005202,5005203,5012193,5019183,5019184,5026174,5033164,5033165,5040155,5047145,5047146,5054136,5061126,5061127,5068117,5075107,5075108,5082098,5089088,5089089,5096079,5103069,5103070,5110060,5117050,5117051,5124041,5131031,5131032,5138022,5145012,5145013,5152003,5158993,5158994,5165984,5172974,5172975,5179965,5186955,5186956,5193946,5200936,5200937,5207927,5214917,5214918,5221908,5228898,5228899,5235889,5242879,5242880,5249870,5249871,5256861,5263851,5263852,5270842,5277832,5277833,5284823,5291813,5291814,5298804,5305794,5305795,5312785,5319775,5319776,5326766,5333756,5333757,5340747,5347737,5347738,5354728,5361718,5361719,5368709,5375699,5375700,5382690,5389680,5389681,5396671,5403661,5403662,5410652,5417642,5417643,5424633,5431623,5431624,5438614,5445604,5445605,5452595,5459585,5459586,5466576,5473566,5473567,5480557,5487547,5487548,5494538,5501528,5501529,5508519,5515509,5515510,5522500,5529490,5529491,5536481,5543471,5543472,5550462,5557452,5557453,5564443,5571433,5571434,5578424,5585414,5585415,5592405,5599395,5599396,5606386,5613376,5613377,5620367,5627357,5627358,5634348,5641338,5641339,5648329,5655319,5655320,5662310,5669300,5669301,5676291,5683281,5683282,5690272,5697262,5697263,5704253,5711243,5711244,5718234,5725224,5725225,5732215,5739205,5739206,5746196,5753186,5753187,5760177,5767167,5767168,5774158,5774159,5781149,5788139,5788140,5795130,5802120,5802121,5809111,5816101,5816102,5823092,5830082,5830083,5837073,5844063,5844064,5851054,5858044,5858045,5865035,5872025,5872026,5879016,5886006,5886007,5892997,5899987,5899988,5906978,5913968,5913969,5920959,5927949,5927950,5934940,5941930,5941931,5948921,5955911,5955912,5962902,5969892,5969893,5976883,5983873,5983874,5990864,5997854,5997855,6004845,6011835,6011836,6018826,6025816,6025817,6032807,6039797,6039798,6046788,6053778,6053779,6060769,6067759,6067760,6074750,6081740,6081741,6088731,6095721,6095722,6102712,6109702,6109703,6116693,6123683,6123684,6130674,6137664,6137665,6144655,6151645,6151646,6158636,6165626,6165627,6172617,6179607,6179608,6186598,6193588,6193589,6200579,6207569,6207570,6214560,6221550,6221551,6228541,6235531,6235532,6242522,6249512,6249513,6256503,6263493,6263494,6270484,6277474,6277475,6284465,6291455,6291456,6298446,6298447,6305437,6312427,6312428,6319418,6326408,6326409,6333399,6340389,6340390,6347380,6354370,6354371,6361361,6368351,6368352,6375342,6382332,6382333,6389323,6396313,6396314,6403304,6410294,6410295,6417285,6424275,6424276,6431266,6438256,6438257,6445247,6452237,6452238,6459228,6466218,6466219,6473209,6480199,6480200,6487190,6494180,6494181,6501171,6508161,6508162,6515152,6522142,6522143,6529133,6536123,6536124,6543114,6550104,6550105,6557095,6564085,6564086,6571076,6578066,6578067,6585057,6592047,6592048,6599038,6606028,6606029,6613019,6620009,6620010,6627000,6633990,6633991,6640981,6647971,6647972,6654962,6661952,6661953,6668943,6675933,6675934,6682924,6689914,6689915,6696905,6703895,6703896,6710886,6717876,6717877,6724867,6731857,6731858,6738848,6745838,6745839,6752829,6759819,6759820,6766810,6773800,6773801,6780791,6787781,6787782,6794772,6801762,6801763,6808753,6815743,6815744,6822734,6822735,6829725,6836715,6836716,6843706,6850696,6850697,6857687,6864677,6864678,6871668,6878658,6878659,6885649,6892639,6892640,6899630,6906620,6906621,6913611,6920601,6920602,6927592,6934582,6934583,6941573,6948563,6948564,6955554,6962544,6962545,6969535,6976525,6976526,6983516,6990506,6990507,6997497,7004487,7004488,7011478,7018468,7018469,7025459,7032449,7032450,7039440,7046430,7046431,7053421,7060411,7060412,7067402,7074392,7074393,7081383,7088373,7088374,7095364,7102354,7102355,7109345,7116335,7116336,7123326,7130316,7130317,7137307,7144297,7144298,7151288,7158278,7158279,7165269,7172259,7172260,7179250,7186240,7186241,7193231,7200221,7200222,7207212,7214202,7214203,7221193,7228183,7228184,7235174,7242164,7242165,7249155,7256145,7256146,7263136,7270126,7270127,7277117,7284107,7284108,7291098,7298088,7298089,7305079,7312069,7312070,7319060,7326050,7326051,7333041,7340031,7340032,7347022,7347023,7354013,7361003,7361004,7367994,7374984,7374985,7381975,7388965,7388966,7395956,7402946,7402947,7409937,7416927,7416928,7423918,7430908,7430909,7437899,7444889,7444890,7451880,7458870,7458871,7465861,7472851,7472852,7479842,7486832,7486833,7493823,7500813,7500814,7507804,7514794,7514795,7521785,7528775,7528776,7535766,7542756,7542757,7549747,7556737,7556738,7563728,7570718,7570719,7577709,7584699,7584700,7591690,7598680,7598681,7605671,7612661,7612662,7619652,7626642,7626643,7633633,7640623,7640624,7647614,7654604,7654605,7661595,7668585,7668586,7675576,7682566,7682567,7689557,7696547,7696548,7703538,7710528,7710529,7717519,7724509,7724510,7731500,7738490,7738491,7745481,7752471,7752472,7759462,7766452,7766453,7773443,7780433,7780434,7787424,7794414,7794415,7801405,7808395,7808396,7815386,7822376,7822377,7829367,7836357,7836358,7843348,7850338,7850339,7857329,7864320,7871310,7871311,7878301,7885291,7885292,7892282,7899272,7899273,7906263,7913253,7913254,7920244,7927234,7927235,7934225,7941215,7941216,7948206,7955196,7955197,7962187,7969177,7969178,7976168,7983158,7983159,7990149,7997139,7997140,8004130,8011120,8011121,8018111,8025101,8025102,8032092,8039082,8039083,8046073,8053063,8053064,8060054,8067044,8067045,8074035,8081025,8081026,8088016,8095006,8095007,8101997,8108987,8108988,8115978,8122968,8122969,8129959,8136949,8136950,8143940,8150930,8150931,8157921,8164911,8164912,8171902,8178892,8178893,8185883,8192873,8192874,8199864,8206854,8206855,8213845,8220835,8220836,8227826,8234816,8234817,8241807,8248797,8248798,8255788,8262778,8262779,8269769,8276759,8276760,8283750,8290740,8290741,8297731,8304721,8304722,8311712,8318702,8318703,8325693,8332683,8332684,8339674,8346664,8346665,8353655,8360645,8360646,8367636,8374626,8374627,8381617,8388607)  or (i >= 1024 and i<= 2048)  ;'

// const result2 = await pool.query(sql2);
    
// timeend('merge');



timestart('nojoin');
sql1 = 'SELECT i, minvd, maxvd FROM mock3_om3 where i in (1024, 1025, 1027, 1029, 1030, 1032, 1034, 1035, 1037, 1039, 1041, 1042, 1044, 1046, 1047, 1049, 1051, 1053, 1054, 1056, 1058, 1059, 1061, 1063, 1064, 1066, 1068, 1070, 1071, 1073, 1075, 1076, 1078, 1080, 1082, 1083, 1085, 1087, 1088, 1090, 1092, 1093, 1095, 1097, 1099, 1100, 1102, 1104, 1105, 1107, 1109, 1111, 1112, 1114, 1116, 1117, 1119, 1121, 1122, 1124, 1126, 1128, 1129, 1131, 1133, 1134, 1136, 1138, 1140, 1141, 1143, 1145, 1146, 1148, 1150, 1151, 1152, 1153, 1155, 1157, 1158, 1160, 1162, 1163, 1165, 1167, 1169, 1170, 1172, 1174, 1175, 1177, 1179, 1181, 1182, 1184, 1186, 1187, 1189, 1191, 1192, 1194, 1196, 1198, 1199, 1201, 1203, 1204, 1206, 1208, 1210, 1211, 1213, 1215, 1216, 1218, 1220, 1221, 1223, 1225, 1227, 1228, 1230, 1232, 1233, 1235, 1237, 1239, 1240, 1242, 1244, 1245, 1247, 1249, 1250, 1252, 1254, 1256, 1257, 1259, 1261, 1262, 1264, 1266, 1268, 1269, 1271, 1273, 1274, 1276, 1278, 1279, 1280, 1281, 1283, 1285, 1286, 1288, 1290, 1291, 1293, 1295, 1297, 1298, 1300, 1302, 1303, 1305, 1307, 1309, 1310, 1312, 1314, 1315, 1317, 1319, 1320, 1322, 1324, 1326, 1327, 1329, 1331, 1332, 1334, 1336, 1338, 1339, 1341, 1343, 1344, 1346, 1348, 1349, 1351, 1353, 1355, 1356, 1358, 1360, 1361, 1363, 1365, 1367, 1368, 1370, 1372, 1373, 1375, 1377, 1378, 1380, 1382, 1384, 1385, 1387, 1389, 1390, 1392, 1394, 1396, 1397, 1399, 1401, 1402, 1404, 1406, 1407, 1408, 1409, 1411, 1413, 1414, 1416, 1418, 1419, 1421, 1423, 1425, 1426, 1428, 1430, 1431, 1433, 1435, 1437, 1438, 1440, 1442, 1443, 1445, 1447, 1448, 1450, 1452, 1454, 1455, 1457, 1459, 1460, 1462, 1464, 1466, 1467, 1469, 1471, 1472, 1474, 1476, 1477, 1479, 1481, 1483, 1484, 1486, 1488, 1489, 1491, 1493, 1495, 1496, 1498, 1500, 1501, 1503, 1505, 1506, 1508, 1510, 1512, 1513, 1515, 1517, 1518, 1520, 1522, 1524, 1525, 1527, 1529, 1530, 1532, 1534, 1535, 1536, 1537, 1539, 1541, 1542, 1544, 1546, 1547, 1549, 1551, 1553, 1554, 1556, 1558, 1559, 1561, 1563, 1565, 1566, 1568, 1570, 1571, 1573, 1575, 1576, 1578, 1580, 1582, 1583, 1585, 1587, 1588, 1590, 1592, 1594, 1595, 1597, 1599, 1600, 1602, 1604, 1605, 1607, 1609, 1611, 1612, 1614, 1616, 1617, 1619, 1621, 1623, 1624, 1626, 1628, 1629, 1631, 1633, 1634, 1636, 1638, 1640, 1641, 1643, 1645, 1646, 1648, 1650, 1652, 1653, 1655, 1657, 1658, 1660, 1662, 1663, 1664, 1665, 1667, 1669, 1670, 1672, 1674, 1675, 1677, 1679, 1681, 1682, 1684, 1686, 1687, 1689, 1691, 1693, 1694, 1696, 1698, 1699, 1701, 1703, 1704, 1706, 1708, 1710, 1711, 1713, 1715, 1716, 1718, 1720, 1722, 1723, 1725, 1727, 1728, 1730, 1732, 1733, 1735, 1737, 1739, 1740, 1742, 1744, 1745, 1747, 1749, 1751, 1752, 1754, 1756, 1757, 1759, 1761, 1762, 1764, 1766, 1768, 1769, 1771, 1773, 1774, 1776, 1778, 1780, 1781, 1783, 1785, 1786, 1788, 1790, 1791, 1792, 1793, 1795, 1797, 1798, 1800, 1802, 1803, 1805, 1807, 1809, 1810, 1812, 1814, 1815, 1817, 1819, 1821, 1822, 1824, 1826, 1827, 1829, 1831, 1832, 1834, 1836, 1838, 1839, 1841, 1843, 1844, 1846, 1848, 1850, 1851, 1853, 1855, 1856, 1858, 1860, 1861, 1863, 1865, 1867, 1868, 1870, 1872, 1873, 1875, 1877, 1879, 1880, 1882, 1884, 1885, 1887, 1889, 1890, 1892, 1894, 1896, 1897, 1899, 1901, 1902, 1904, 1906, 1908, 1909, 1911, 1913, 1914, 1916, 1918, 1920, 1921, 1923, 1925, 1926, 1928, 1930, 1931, 1933, 1935, 1937, 1938, 1940, 1942, 1943, 1945, 1947, 1949, 1950, 1952, 1954, 1955, 1957, 1959, 1960, 1962, 1964, 1966, 1967, 1969, 1971, 1972, 1974, 1976, 1978, 1979, 1981, 1983, 1984, 1986, 1988, 1989, 1991, 1993, 1995, 1996, 1998, 2000, 2001, 2003, 2005, 2007, 2008, 2010, 2012, 2013, 2015, 2017, 2018, 2020, 2022, 2024, 2025, 2027, 2029, 2030, 2032, 2034, 2036, 2037, 2039, 2041, 2042, 2044, 2046, 2047, 2048, 2051, 2054, 2058, 2061, 2065, 2068, 2071, 2075, 2078, 2082, 2085, 2088, 2092, 2095, 2099, 2102, 2106, 2109, 2112, 2116, 2119, 2123, 2126, 2129, 2133, 2136, 2140, 2143, 2146, 2150, 2153, 2157, 2160, 2164, 2167, 2170, 2174, 2177, 2181, 2184, 2187, 2191, 2194, 2198, 2201, 2205, 2208, 2211, 2215, 2218, 2222, 2225, 2228, 2232, 2235, 2239, 2242, 2245, 2249, 2252, 2256, 2259, 2263, 2266, 2269, 2273, 2276, 2280, 2283, 2286, 2290, 2293, 2297, 2300, 2303, 2304, 2307, 2310, 2314, 2317, 2321, 2324, 2327, 2331, 2334, 2338, 2341, 2344, 2348, 2351, 2355, 2358, 2362, 2365, 2368, 2372, 2375, 2379, 2382, 2385, 2389, 2392, 2396, 2399, 2402, 2406, 2409, 2413, 2416, 2420, 2423, 2426, 2430, 2433, 2437, 2440, 2443, 2447, 2450, 2454, 2457, 2461, 2464, 2467, 2471, 2474, 2478, 2481, 2484, 2488, 2491, 2495, 2498, 2501, 2505, 2508, 2512, 2515, 2519, 2522, 2525, 2529, 2532, 2536, 2539, 2542, 2546, 2549, 2553, 2556, 2559, 2560, 2563, 2566, 2570, 2573, 2577, 2580, 2583, 2587, 2590, 2594, 2597, 2600, 2604, 2607, 2611, 2614, 2618, 2621, 2624, 2628, 2631, 2635, 2638, 2641, 2645, 2648, 2652, 2655, 2658, 2662, 2665, 2669, 2672, 2676, 2679, 2682, 2686, 2689, 2693, 2696, 2699, 2703, 2706, 2710, 2713, 2717, 2720, 2723, 2727, 2730, 2734, 2737, 2740, 2744, 2747, 2751, 2754, 2757, 2761, 2764, 2768, 2771, 2775, 2778, 2781, 2785, 2788, 2792, 2795, 2798, 2802, 2805, 2809, 2812, 2815, 2816, 2819, 2822, 2826, 2829, 2833, 2836, 2839, 2843, 2846, 2850, 2853, 2856, 2860, 2863, 2867, 2870, 2874, 2877, 2880, 2884, 2887, 2891, 2894, 2897, 2901, 2904, 2908, 2911, 2914, 2918, 2921, 2925, 2928, 2932, 2935, 2938, 2942, 2945, 2949, 2952, 2955, 2959, 2962, 2966, 2969, 2973, 2976, 2979, 2983, 2986, 2990, 2993, 2996, 3000, 3003, 3007, 3010, 3013, 3017, 3020, 3024, 3027, 3031, 3034, 3037, 3041, 3044, 3048, 3051, 3054, 3058, 3061, 3065, 3068, 3071, 3072, 3075, 3078, 3082, 3085, 3089, 3092, 3095, 3099, 3102, 3106, 3109, 3112, 3116, 3119, 3123, 3126, 3130, 3133, 3136, 3140, 3143, 3147, 3150, 3153, 3157, 3160, 3164, 3167, 3170, 3174, 3177, 3181, 3184, 3188, 3191, 3194, 3198, 3201, 3205, 3208, 3211, 3215, 3218, 3222, 3225, 3229, 3232, 3235, 3239, 3242, 3246, 3249, 3252, 3256, 3259, 3263, 3266, 3269, 3273, 3276, 3280, 3283, 3287, 3290, 3293, 3297, 3300, 3304, 3307, 3310, 3314, 3317, 3321, 3324, 3327, 3328, 3331, 3334, 3338, 3341, 3345, 3348, 3351, 3355, 3358, 3362, 3365, 3368, 3372, 3375, 3379, 3382, 3386, 3389, 3392, 3396, 3399, 3403, 3406, 3409, 3413, 3416, 3420, 3423, 3426, 3430, 3433, 3437, 3440, 3444, 3447, 3450, 3454, 3457, 3461, 3464, 3467, 3471, 3474, 3478, 3481, 3485, 3488, 3491, 3495, 3498, 3502, 3505, 3508, 3512, 3515, 3519, 3522, 3525, 3529, 3532, 3536, 3539, 3543, 3546, 3549, 3553, 3556, 3560, 3563, 3566, 3570, 3573, 3577, 3580, 3583, 3584, 3587, 3590, 3594, 3597, 3601, 3604, 3607, 3611, 3614, 3618, 3621, 3624, 3628, 3631, 3635, 3638, 3642, 3645, 3648, 3652, 3655, 3659, 3662, 3665, 3669, 3672, 3676, 3679, 3682, 3686, 3689, 3693, 3696, 3700, 3703, 3706, 3710, 3713, 3717, 3720, 3723, 3727, 3730, 3734, 3737, 3741, 3744, 3747, 3751, 3754, 3758, 3761, 3764, 3768, 3771, 3775, 3778, 3781, 3785, 3788, 3792, 3795, 3799, 3802, 3805, 3809, 3812, 3816, 3819, 3822, 3826, 3829, 3833, 3836, 3840, 3843, 3846, 3850, 3853, 3857, 3860, 3863, 3867, 3870, 3874, 3877, 3880, 3884, 3887, 3891, 3894, 3898, 3901, 3904, 3908, 3911, 3915, 3918, 3921, 3925, 3928, 3932, 3935, 3938, 3942, 3945, 3949, 3952, 3956, 3959, 3962, 3966, 3969, 3973, 3976, 3979, 3983, 3986, 3990, 3993, 3997, 4000, 4003, 4007, 4010, 4014, 4017, 4020, 4024, 4027, 4031, 4034, 4037, 4041, 4044, 4048, 4051, 4055, 4058, 4061, 4065, 4068, 4072, 4075, 4078, 4082, 4085, 4089, 4092, 4095, 4096, 4102, 4109, 4116, 4123, 4130, 4136, 4143, 4150, 4157, 4164, 4171, 4177, 4184, 4191, 4198, 4205, 4212, 4218, 4225, 4232, 4239, 4246, 4253, 4259, 4266, 4273, 4280, 4287, 4293, 4300, 4307, 4314, 4321, 4328, 4334, 4341, 4348, 4355, 4362, 4369, 4375, 4382, 4389, 4396, 4403, 4410, 4416, 4423, 4430, 4437, 4444, 4450, 4457, 4464, 4471, 4478, 4485, 4491, 4498, 4505, 4512, 4519, 4526, 4532, 4539, 4546, 4553, 4560, 4567, 4573, 4580, 4587, 4594, 4601, 4607, 4608, 4614, 4621, 4628, 4635, 4642, 4648, 4655, 4662, 4669, 4676, 4683, 4689, 4696, 4703, 4710, 4717, 4724, 4730, 4737, 4744, 4751, 4758, 4765, 4771, 4778, 4785, 4792, 4799, 4805, 4812, 4819, 4826, 4833, 4840, 4846, 4853, 4860, 4867, 4874, 4881, 4887, 4894, 4901, 4908, 4915, 4922, 4928, 4935, 4942, 4949, 4956, 4962, 4969, 4976, 4983, 4990, 4997, 5003, 5010, 5017, 5024, 5031, 5038, 5044, 5051, 5058, 5065, 5072, 5079, 5085, 5092, 5099, 5106, 5113, 5119, 5120, 5126, 5133, 5140, 5147, 5154, 5160, 5167, 5174, 5181, 5188, 5195, 5201, 5208, 5215, 5222, 5229, 5236, 5242, 5249, 5256, 5263, 5270, 5277, 5283, 5290, 5297, 5304, 5311, 5317, 5324, 5331, 5338, 5345, 5352, 5358, 5365, 5372, 5379, 5386, 5393, 5399, 5406, 5413, 5420, 5427, 5434, 5440, 5447, 5454, 5461, 5468, 5474, 5481, 5488, 5495, 5502, 5509, 5515, 5522, 5529, 5536, 5543, 5550, 5556, 5563, 5570, 5577, 5584, 5591, 5597, 5604, 5611, 5618, 5625, 5631, 5632, 5638, 5645, 5652, 5659, 5666, 5672, 5679, 5686, 5693, 5700, 5707, 5713, 5720, 5727, 5734, 5741, 5748, 5754, 5761, 5768, 5775, 5782, 5789, 5795, 5802, 5809, 5816, 5823, 5829, 5836, 5843, 5850, 5857, 5864, 5870, 5877, 5884, 5891, 5898, 5905, 5911, 5918, 5925, 5932, 5939, 5946, 5952, 5959, 5966, 5973, 5980, 5986, 5993, 6000, 6007, 6014, 6021, 6027, 6034, 6041, 6048, 6055, 6062, 6068, 6075, 6082, 6089, 6096, 6103, 6109, 6116, 6123, 6130, 6137, 6143, 6144, 6150, 6157, 6164, 6171, 6178, 6184, 6191, 6198, 6205, 6212, 6219, 6225, 6232, 6239, 6246, 6253, 6260, 6266, 6273, 6280, 6287, 6294, 6301, 6307, 6314, 6321, 6328, 6335, 6341, 6348, 6355, 6362, 6369, 6376, 6382, 6389, 6396, 6403, 6410, 6417, 6423, 6430, 6437, 6444, 6451, 6458, 6464, 6471, 6478, 6485, 6492, 6498, 6505, 6512, 6519, 6526, 6533, 6539, 6546, 6553, 6560, 6567, 6574, 6580, 6587, 6594, 6601, 6608, 6615, 6621, 6628, 6635, 6642, 6649, 6655, 6656, 6662, 6669, 6676, 6683, 6690, 6696, 6703, 6710, 6717, 6724, 6731, 6737, 6744, 6751, 6758, 6765, 6772, 6778, 6785, 6792, 6799, 6806, 6813, 6819, 6826, 6833, 6840, 6847, 6853, 6860, 6867, 6874, 6881, 6888, 6894, 6901, 6908, 6915, 6922, 6929, 6935, 6942, 6949, 6956, 6963, 6970, 6976, 6983, 6990, 6997, 7004, 7010, 7017, 7024, 7031, 7038, 7045, 7051, 7058, 7065, 7072, 7079, 7086, 7092, 7099, 7106, 7113, 7120, 7127, 7133, 7140, 7147, 7154, 7161, 7167, 7168, 7174, 7181, 7188, 7195, 7202, 7208, 7215, 7222, 7229, 7236, 7243, 7249, 7256, 7263, 7270, 7277, 7284, 7290, 7297, 7304, 7311, 7318, 7325, 7331, 7338, 7345, 7352, 7359, 7365, 7372, 7379, 7386, 7393, 7400, 7406, 7413, 7420, 7427, 7434, 7441, 7447, 7454, 7461, 7468, 7475, 7482, 7488, 7495, 7502, 7509, 7516, 7522, 7529, 7536, 7543, 7550, 7557, 7563, 7570, 7577, 7584, 7591, 7598, 7604, 7611, 7618, 7625, 7632, 7639, 7645, 7652, 7659, 7666, 7673, 7680, 7686, 7693, 7700, 7707, 7714, 7720, 7727, 7734, 7741, 7748, 7755, 7761, 7768, 7775, 7782, 7789, 7796, 7802, 7809, 7816, 7823, 7830, 7837, 7843, 7850, 7857, 7864, 7871, 7877, 7884, 7891, 7898, 7905, 7912, 7918, 7925, 7932, 7939, 7946, 7953, 7959, 7966, 7973, 7980, 7987, 7994, 8000, 8007, 8014, 8021, 8028, 8034, 8041, 8048, 8055, 8062, 8069, 8075, 8082, 8089, 8096, 8103, 8110, 8116, 8123, 8130, 8137, 8144, 8151, 8157, 8164, 8171, 8178, 8185, 8191, 8192, 8205, 8219, 8232, 8246, 8260, 8273, 8287, 8301, 8314, 8328, 8342, 8355, 8369, 8383, 8396, 8410, 8424, 8437, 8451, 8465, 8478, 8492, 8506, 8519, 8533, 8546, 8560, 8574, 8587, 8601, 8615, 8628, 8642, 8656, 8669, 8683, 8697, 8710, 8724, 8738, 8751, 8765, 8779, 8792, 8806, 8820, 8833, 8847, 8861, 8874, 8888, 8901, 8915, 8929, 8942, 8956, 8970, 8983, 8997, 9011, 9024, 9038, 9052, 9065, 9079, 9093, 9106, 9120, 9134, 9147, 9161, 9175, 9188, 9202, 9215, 9216, 9229, 9243, 9256, 9270, 9284, 9297, 9311, 9325, 9338, 9352, 9366, 9379, 9393, 9407, 9420, 9434, 9448, 9461, 9475, 9489, 9502, 9516, 9530, 9543, 9557, 9570, 9584, 9598, 9611, 9625, 9639, 9652, 9666, 9680, 9693, 9707, 9721, 9734, 9748, 9762, 9775, 9789, 9803, 9816, 9830, 9844, 9857, 9871, 9885, 9898, 9912, 9925, 9939, 9953, 9966, 9980, 9994, 10007, 10021, 10035, 10048, 10062, 10076, 10089, 10103, 10117, 10130, 10144, 10158, 10171, 10185, 10199, 10212, 10226, 10239, 10240, 10253, 10267, 10280, 10294, 10308, 10321, 10335, 10349, 10362, 10376, 10390, 10403, 10417, 10431, 10444, 10458, 10472, 10485, 10499, 10513, 10526, 10540, 10554, 10567, 10581, 10594, 10608, 10622, 10635, 10649, 10663, 10676, 10690, 10704, 10717, 10731, 10745, 10758, 10772, 10786, 10799, 10813, 10827, 10840, 10854, 10868, 10881, 10895, 10909, 10922, 10936, 10949, 10963, 10977, 10990, 11004, 11018, 11031, 11045, 11059, 11072, 11086, 11100, 11113, 11127, 11141, 11154, 11168, 11182, 11195, 11209, 11223, 11236, 11250, 11263, 11264, 11277, 11291, 11304, 11318, 11332, 11345, 11359, 11373, 11386, 11400, 11414, 11427, 11441, 11455, 11468, 11482, 11496, 11509, 11523, 11537, 11550, 11564, 11578, 11591, 11605, 11618, 11632, 11646, 11659, 11673, 11687, 11700, 11714, 11728, 11741, 11755, 11769, 11782, 11796, 11810, 11823, 11837, 11851, 11864, 11878, 11892, 11905, 11919, 11933, 11946, 11960, 11973, 11987, 12001, 12014, 12028, 12042, 12055, 12069, 12083, 12096, 12110, 12124, 12137, 12151, 12165, 12178, 12192, 12206, 12219, 12233, 12247, 12260, 12274, 12287, 12288, 12301, 12315, 12328, 12342, 12356, 12369, 12383, 12397, 12410, 12424, 12438, 12451, 12465, 12479, 12492, 12506, 12520, 12533, 12547, 12561, 12574, 12588, 12602, 12615, 12629, 12642, 12656, 12670, 12683, 12697, 12711, 12724, 12738, 12752, 12765, 12779, 12793, 12806, 12820, 12834, 12847, 12861, 12875, 12888, 12902, 12916, 12929, 12943, 12957, 12970, 12984, 12997, 13011, 13025, 13038, 13052, 13066, 13079, 13093, 13107, 13120, 13134, 13148, 13161, 13175, 13189, 13202, 13216, 13230, 13243, 13257, 13271, 13284, 13298, 13311, 13312, 13325, 13339, 13352, 13366, 13380, 13393, 13407, 13421, 13434, 13448, 13462, 13475, 13489, 13503, 13516, 13530, 13544, 13557, 13571, 13585, 13598, 13612, 13626, 13639, 13653, 13666, 13680, 13694, 13707, 13721, 13735, 13748, 13762, 13776, 13789, 13803, 13817, 13830, 13844, 13858, 13871, 13885, 13899, 13912, 13926, 13940, 13953, 13967, 13981, 13994, 14008, 14021, 14035, 14049, 14062, 14076, 14090, 14103, 14117, 14131, 14144, 14158, 14172, 14185, 14199, 14213, 14226, 14240, 14254, 14267, 14281, 14295, 14308, 14322, 14335, 14336, 14349, 14363, 14376, 14390, 14404, 14417, 14431, 14445, 14458, 14472, 14486, 14499, 14513, 14527, 14540, 14554, 14568, 14581, 14595, 14609, 14622, 14636, 14650, 14663, 14677, 14690, 14704, 14718, 14731, 14745, 14759, 14772, 14786, 14800, 14813, 14827, 14841, 14854, 14868, 14882, 14895, 14909, 14923, 14936, 14950, 14964, 14977, 14991, 15005, 15018, 15032, 15045, 15059, 15073, 15086, 15100, 15114, 15127, 15141, 15155, 15168, 15182, 15196, 15209, 15223, 15237, 15250, 15264, 15278, 15291, 15305, 15319, 15332, 15346, 15360, 15373, 15387, 15400, 15414, 15428, 15441, 15455, 15469, 15482, 15496, 15510, 15523, 15537, 15551, 15564, 15578, 15592, 15605, 15619, 15633, 15646, 15660, 15674, 15687, 15701, 15714, 15728, 15742, 15755, 15769, 15783, 15796, 15810, 15824, 15837, 15851, 15865, 15878, 15892, 15906, 15919, 15933, 15947, 15960, 15974, 15988, 16001, 16015, 16029, 16042, 16056, 16069, 16083, 16097, 16110, 16124, 16138, 16151, 16165, 16179, 16192, 16206, 16220, 16233, 16247, 16261, 16274, 16288, 16302, 16315, 16329, 16343, 16356, 16370, 16383, 16384, 16411, 16438, 16465, 16493, 16520, 16547, 16575, 16602, 16629, 16657, 16684, 16711, 16738, 16766, 16793, 16820, 16848, 16875, 16902, 16930, 16957, 16984, 17012, 17039, 17066, 17093, 17121, 17148, 17175, 17203, 17230, 17257, 17285, 17312, 17339, 17367, 17394, 17421, 17448, 17476, 17503, 17530, 17558, 17585, 17612, 17640, 17667, 17694, 17722, 17749, 17776, 17803, 17831, 17858, 17885, 17913, 17940, 17967, 17995, 18022, 18049, 18077, 18104, 18131, 18158, 18186, 18213, 18240, 18268, 18295, 18322, 18350, 18377, 18404, 18431, 18432, 18459, 18486, 18513, 18541, 18568, 18595, 18623, 18650, 18677, 18705, 18732, 18759, 18786, 18814, 18841, 18868, 18896, 18923, 18950, 18978, 19005, 19032, 19060, 19087, 19114, 19141, 19169, 19196, 19223, 19251, 19278, 19305, 19333, 19360, 19387, 19415, 19442, 19469, 19496, 19524, 19551, 19578, 19606, 19633, 19660, 19688, 19715, 19742, 19770, 19797, 19824, 19851, 19879, 19906, 19933, 19961, 19988, 20015, 20043, 20070, 20097, 20125, 20152, 20179, 20206, 20234, 20261, 20288, 20316, 20343, 20370, 20398, 20425, 20452, 20479, 20480, 20507, 20534, 20561, 20589, 20616, 20643, 20671, 20698, 20725, 20753, 20780, 20807, 20834, 20862, 20889, 20916, 20944, 20971, 20998, 21026, 21053, 21080, 21108, 21135, 21162, 21189, 21217, 21244, 21271, 21299, 21326, 21353, 21381, 21408, 21435, 21463, 21490, 21517, 21544, 21572, 21599, 21626, 21654, 21681, 21708, 21736, 21763, 21790, 21818, 21845, 21872, 21899, 21927, 21954, 21981, 22009, 22036, 22063, 22091, 22118, 22145, 22173, 22200, 22227, 22254, 22282, 22309, 22336, 22364, 22391, 22418, 22446, 22473, 22500, 22527, 22528, 22555, 22582, 22609, 22637, 22664, 22691, 22719, 22746, 22773, 22801, 22828, 22855, 22882, 22910, 22937, 22964, 22992, 23019, 23046, 23074, 23101, 23128, 23156, 23183, 23210, 23237, 23265, 23292, 23319, 23347, 23374, 23401, 23429, 23456, 23483, 23511, 23538, 23565, 23592, 23620, 23647, 23674, 23702, 23729, 23756, 23784, 23811, 23838, 23866, 23893, 23920, 23947, 23975, 24002, 24029, 24057, 24084, 24111, 24139, 24166, 24193, 24221, 24248, 24275, 24302, 24330, 24357, 24384, 24412, 24439, 24466, 24494, 24521, 24548, 24575, 24576, 24603, 24630, 24657, 24685, 24712, 24739, 24767, 24794, 24821, 24849, 24876, 24903, 24930, 24958, 24985, 25012, 25040, 25067, 25094, 25122, 25149, 25176, 25204, 25231, 25258, 25285, 25313, 25340, 25367, 25395, 25422, 25449, 25477, 25504, 25531, 25559, 25586, 25613, 25640, 25668, 25695, 25722, 25750, 25777, 25804, 25832, 25859, 25886, 25914, 25941, 25968, 25995, 26023, 26050, 26077, 26105, 26132, 26159, 26187, 26214, 26241, 26269, 26296, 26323, 26350, 26378, 26405, 26432, 26460, 26487, 26514, 26542, 26569, 26596, 26623, 26624, 26651, 26678, 26705, 26733, 26760, 26787, 26815, 26842, 26869, 26897, 26924, 26951, 26978, 27006, 27033, 27060, 27088, 27115, 27142, 27170, 27197, 27224, 27252, 27279, 27306, 27333, 27361, 27388, 27415, 27443, 27470, 27497, 27525, 27552, 27579, 27607, 27634, 27661, 27688, 27716, 27743, 27770, 27798, 27825, 27852, 27880, 27907, 27934, 27962, 27989, 28016, 28043, 28071, 28098, 28125, 28153, 28180, 28207, 28235, 28262, 28289, 28317, 28344, 28371, 28398, 28426, 28453, 28480, 28508, 28535, 28562, 28590, 28617, 28644, 28671, 28672, 28699, 28726, 28753, 28781, 28808, 28835, 28863, 28890, 28917, 28945, 28972, 28999, 29026, 29054, 29081, 29108, 29136, 29163, 29190, 29218, 29245, 29272, 29300, 29327, 29354, 29381, 29409, 29436, 29463, 29491, 29518, 29545, 29573, 29600, 29627, 29655, 29682, 29709, 29736, 29764, 29791, 29818, 29846, 29873, 29900, 29928, 29955, 29982, 30010, 30037, 30064, 30091, 30119, 30146, 30173, 30201, 30228, 30255, 30283, 30310, 30337, 30365, 30392, 30419, 30446, 30474, 30501, 30528, 30556, 30583, 30610, 30638, 30665, 30692, 30720, 30747, 30774, 30801, 30829, 30856, 30883, 30911, 30938, 30965, 30993, 31020, 31047, 31074, 31102, 31129, 31156, 31184, 31211, 31238, 31266, 31293, 31320, 31348, 31375, 31402, 31429, 31457, 31484, 31511, 31539, 31566, 31593, 31621, 31648, 31675, 31703, 31730, 31757, 31784, 31812, 31839, 31866, 31894, 31921, 31948, 31976, 32003, 32030, 32058, 32085, 32112, 32139, 32167, 32194, 32221, 32249, 32276, 32303, 32331, 32358, 32385, 32413, 32440, 32467, 32494, 32522, 32549, 32576, 32604, 32631, 32658, 32686, 32713, 32740, 32767, 32768, 32822, 32877, 32931, 32986, 33041, 33095, 33150, 33204, 33259, 33314, 33368, 33423, 33477, 33532, 33587, 33641, 33696, 33751, 33805, 33860, 33914, 33969, 34024, 34078, 34133, 34187, 34242, 34297, 34351, 34406, 34461, 34515, 34570, 34624, 34679, 34734, 34788, 34843, 34897, 34952, 35007, 35061, 35116, 35170, 35225, 35280, 35334, 35389, 35444, 35498, 35553, 35607, 35662, 35717, 35771, 35826, 35880, 35935, 35990, 36044, 36099, 36154, 36208, 36263, 36317, 36372, 36427, 36481, 36536, 36590, 36645, 36700, 36754, 36809, 36863, 36864, 36918, 36973, 37027, 37082, 37137, 37191, 37246, 37300, 37355, 37410, 37464, 37519, 37573, 37628, 37683, 37737, 37792, 37847, 37901, 37956, 38010, 38065, 38120, 38174, 38229, 38283, 38338, 38393, 38447, 38502, 38557, 38611, 38666, 38720, 38775, 38830, 38884, 38939, 38993, 39048, 39103, 39157, 39212, 39266, 39321, 39376, 39430, 39485, 39540, 39594, 39649, 39703, 39758, 39813, 39867, 39922, 39976, 40031, 40086, 40140, 40195, 40250, 40304, 40359, 40413, 40468, 40523, 40577, 40632, 40686, 40741, 40796, 40850, 40905, 40959, 40960, 41014, 41069, 41123, 41178, 41233, 41287, 41342, 41396, 41451, 41506, 41560, 41615, 41669, 41724, 41779, 41833, 41888, 41943, 41997, 42052, 42106, 42161, 42216, 42270, 42325, 42379, 42434, 42489, 42543, 42598, 42653, 42707, 42762, 42816, 42871, 42926, 42980, 43035, 43089, 43144, 43199, 43253, 43308, 43362, 43417, 43472, 43526, 43581, 43636, 43690, 43745, 43799, 43854, 43909, 43963, 44018, 44072, 44127, 44182, 44236, 44291, 44346, 44400, 44455, 44509, 44564, 44619, 44673, 44728, 44782, 44837, 44892, 44946, 45001, 45055, 45056, 45110, 45165, 45219, 45274, 45329, 45383, 45438, 45492, 45547, 45602, 45656, 45711, 45765, 45820, 45875, 45929, 45984, 46039, 46093, 46148, 46202, 46257, 46312, 46366, 46421, 46475, 46530, 46585, 46639, 46694, 46749, 46803, 46858, 46912, 46967, 47022, 47076, 47131, 47185, 47240, 47295, 47349, 47404, 47458, 47513, 47568, 47622, 47677, 47732, 47786, 47841, 47895, 47950, 48005, 48059, 48114, 48168, 48223, 48278, 48332, 48387, 48442, 48496, 48551, 48605, 48660, 48715, 48769, 48824, 48878, 48933, 48988, 49042, 49097, 49151, 49152, 49206, 49261, 49315, 49370, 49425, 49479, 49534, 49588, 49643, 49698, 49752, 49807, 49861, 49916, 49971, 50025, 50080, 50135, 50189, 50244, 50298, 50353, 50408, 50462, 50517, 50571, 50626, 50681, 50735, 50790, 50845, 50899, 50954, 51008, 51063, 51118, 51172, 51227, 51281, 51336, 51391, 51445, 51500, 51554, 51609, 51664, 51718, 51773, 51828, 51882, 51937, 51991, 52046, 52101, 52155, 52210, 52264, 52319, 52374, 52428, 52483, 52538, 52592, 52647, 52701, 52756, 52811, 52865, 52920, 52974, 53029, 53084, 53138, 53193, 53247, 53248, 53302, 53357, 53411, 53466, 53521, 53575, 53630, 53684, 53739, 53794, 53848, 53903, 53957, 54012, 54067, 54121, 54176, 54231, 54285, 54340, 54394, 54449, 54504, 54558, 54613, 54667, 54722, 54777, 54831, 54886, 54941, 54995, 55050, 55104, 55159, 55214, 55268, 55323, 55377, 55432, 55487, 55541, 55596, 55650, 55705, 55760, 55814, 55869, 55924, 55978, 56033, 56087, 56142, 56197, 56251, 56306, 56360, 56415, 56470, 56524, 56579, 56634, 56688, 56743, 56797, 56852, 56907, 56961, 57016, 57070, 57125, 57180, 57234, 57289, 57343, 57344, 57398, 57453, 57507, 57562, 57617, 57671, 57726, 57780, 57835, 57890, 57944, 57999, 58053, 58108, 58163, 58217, 58272, 58327, 58381, 58436, 58490, 58545, 58600, 58654, 58709, 58763, 58818, 58873, 58927, 58982, 59037, 59091, 59146, 59200, 59255, 59310, 59364, 59419, 59473, 59528, 59583, 59637, 59692, 59746, 59801, 59856, 59910, 59965, 60020, 60074, 60129, 60183, 60238, 60293, 60347, 60402, 60456, 60511, 60566, 60620, 60675, 60730, 60784, 60839, 60893, 60948, 61003, 61057, 61112, 61166, 61221, 61276, 61330, 61385, 61440, 61494, 61549, 61603, 61658, 61713, 61767, 61822, 61876, 61931, 61986, 62040, 62095, 62149, 62204, 62259, 62313, 62368, 62423, 62477, 62532, 62586, 62641, 62696, 62750, 62805, 62859, 62914, 62969, 63023, 63078, 63133, 63187, 63242, 63296, 63351, 63406, 63460, 63515, 63569, 63624, 63679, 63733, 63788, 63842, 63897, 63952, 64006, 64061, 64116, 64170, 64225, 64279, 64334, 64389, 64443, 64498, 64552, 64607, 64662, 64716, 64771, 64826, 64880, 64935, 64989, 65044, 65099, 65153, 65208, 65262, 65317, 65372, 65426, 65481, 65535, 65536, 65645, 65754, 65863, 65972, 66082, 66191, 66300, 66409, 66519, 66628, 66737, 66846, 66955, 67065, 67174, 67283, 67392, 67502, 67611, 67720, 67829, 67938, 68048, 68157, 68266, 68375, 68485, 68594, 68703, 68812, 68922, 69031, 69140, 69249, 69358, 69468, 69577, 69686, 69795, 69905, 70014, 70123, 70232, 70341, 70451, 70560, 70669, 70778, 70888, 70997, 71106, 71215, 71325, 71434, 71543, 71652, 71761, 71871, 71980, 72089, 72198, 72308, 72417, 72526, 72635, 72744, 72854, 72963, 73072, 73181, 73291, 73400, 73509, 73618, 73727, 73728, 73837, 73946, 74055, 74164, 74274, 74383, 74492, 74601, 74711, 74820, 74929, 75038, 75147, 75257, 75366, 75475, 75584, 75694, 75803, 75912, 76021, 76130, 76240, 76349, 76458, 76567, 76677, 76786, 76895, 77004, 77114, 77223, 77332, 77441, 77550, 77660, 77769, 77878, 77987, 78097, 78206, 78315, 78424, 78533, 78643, 78752, 78861, 78970, 79080, 79189, 79298, 79407, 79517, 79626, 79735, 79844, 79953, 80063, 80172, 80281, 80390, 80500, 80609, 80718, 80827, 80936, 81046, 81155, 81264, 81373, 81483, 81592, 81701, 81810, 81919, 81920, 82029, 82138, 82247, 82356, 82466, 82575, 82684, 82793, 82903, 83012, 83121, 83230, 83339, 83449, 83558, 83667, 83776, 83886, 83995, 84104, 84213, 84322, 84432, 84541, 84650, 84759, 84869, 84978, 85087, 85196, 85306, 85415, 85524, 85633, 85742, 85852, 85961, 86070, 86179, 86289, 86398, 86507, 86616, 86725, 86835, 86944, 87053, 87162, 87272, 87381, 87490, 87599, 87709, 87818, 87927, 88036, 88145, 88255, 88364, 88473, 88582, 88692, 88801, 88910, 89019, 89128, 89238, 89347, 89456, 89565, 89675, 89784, 89893, 90002, 90111, 90112, 90221, 90330, 90439, 90548, 90658, 90767, 90876, 90985, 91095, 91204, 91313, 91422, 91531, 91641, 91750, 91859, 91968, 92078, 92187, 92296, 92405, 92514, 92624, 92733, 92842, 92951, 93061, 93170, 93279, 93388, 93498, 93607, 93716, 93825, 93934, 94044, 94153, 94262, 94371, 94481, 94590, 94699, 94808, 94917, 95027, 95136, 95245, 95354, 95464, 95573, 95682, 95791, 95901, 96010, 96119, 96228, 96337, 96447, 96556, 96665, 96774, 96884, 96993, 97102, 97211, 97320, 97430, 97539, 97648, 97757, 97867, 97976, 98085, 98194, 98303, 98304, 98413, 98522, 98631, 98740, 98850, 98959, 99068, 99177, 99287, 99396, 99505, 99614, 99723, 99833, 99942, 100051, 100160, 100270, 100379, 100488, 100597, 100706, 100816, 100925, 101034, 101143, 101253, 101362, 101471, 101580, 101690, 101799, 101908, 102017, 102126, 102236, 102345, 102454, 102563, 102673, 102782, 102891, 103000, 103109, 103219, 103328, 103437, 103546, 103656, 103765, 103874, 103983, 104093, 104202, 104311, 104420, 104529, 104639, 104748, 104857, 104966, 105076, 105185, 105294, 105403, 105512, 105622, 105731, 105840, 105949, 106059, 106168, 106277, 106386, 106495, 106496, 106605, 106714, 106823, 106932, 107042, 107151, 107260, 107369, 107479, 107588, 107697, 107806, 107915, 108025, 108134, 108243, 108352, 108462, 108571, 108680, 108789, 108898, 109008, 109117, 109226, 109335, 109445, 109554, 109663, 109772, 109882, 109991, 110100, 110209, 110318, 110428, 110537, 110646, 110755, 110865, 110974, 111083, 111192, 111301, 111411, 111520, 111629, 111738, 111848, 111957, 112066, 112175, 112285, 112394, 112503, 112612, 112721, 112831, 112940, 113049, 113158, 113268, 113377, 113486, 113595, 113704, 113814, 113923, 114032, 114141, 114251, 114360, 114469, 114578, 114687, 114688, 114797, 114906, 115015, 115124, 115234, 115343, 115452, 115561, 115671, 115780, 115889, 115998, 116107, 116217, 116326, 116435, 116544, 116654, 116763, 116872, 116981, 117090, 117200, 117309, 117418, 117527, 117637, 117746, 117855, 117964, 118074, 118183, 118292, 118401, 118510, 118620, 118729, 118838, 118947, 119057, 119166, 119275, 119384, 119493, 119603, 119712, 119821, 119930, 120040, 120149, 120258, 120367, 120477, 120586, 120695, 120804, 120913, 121023, 121132, 121241, 121350, 121460, 121569, 121678, 121787, 121896, 122006, 122115, 122224, 122333, 122443, 122552, 122661, 122770, 122880, 122989, 123098, 123207, 123316, 123426, 123535, 123644, 123753, 123863, 123972, 124081, 124190, 124299, 124409, 124518, 124627, 124736, 124846, 124955, 125064, 125173, 125282, 125392, 125501, 125610, 125719, 125829, 125938, 126047, 126156, 126266, 126375, 126484, 126593, 126702, 126812, 126921, 127030, 127139, 127249, 127358, 127467, 127576, 127685, 127795, 127904, 128013, 128122, 128232, 128341, 128450, 128559, 128669, 128778, 128887, 128996, 129105, 129215, 129324, 129433, 129542, 129652, 129761, 129870, 129979, 130088, 130198, 130307, 130416, 130525, 130635, 130744, 130853, 130962, 131071, 131072, 131290, 131508, 131727, 131945, 132164, 132382, 132601, 132819, 133038, 133256, 133474, 133475, 133693, 133911, 134130, 134348, 134567, 134785, 135004, 135222, 135441, 135659, 135877, 136096, 136314, 136533, 136751, 136970, 137188, 137407, 137625, 137844, 138062, 138280, 138499, 138717, 138936, 139154, 139373, 139591, 139810, 140028, 140247, 140465, 140683, 140902, 141120, 141339, 141557, 141776, 141994, 142213, 142431, 142650, 142868, 143086, 143305, 143523, 143742, 143960, 144179, 144397, 144616, 144834, 145053, 145271, 145489, 145708, 145926, 146145, 146363, 146582, 146800, 147019, 147237, 147455, 147456, 147674, 147892, 148111, 148329, 148548, 148766, 148985, 149203, 149422, 149640, 149858, 149859, 150077, 150295, 150514, 150732, 150951, 151169, 151388, 151606, 151825, 152043, 152261, 152480, 152698, 152917, 153135, 153354, 153572, 153791, 154009, 154228, 154446, 154664, 154883, 155101, 155320, 155538, 155757, 155975, 156194, 156412, 156631, 156849, 157067, 157286, 157504, 157723, 157941, 158160, 158378, 158597, 158815, 159034, 159252, 159470, 159689, 159907, 160126, 160344, 160563, 160781, 161000, 161218, 161437, 161655, 161873, 162092, 162310, 162529, 162747, 162966, 163184, 163403, 163621, 163839, 163840, 164058, 164276, 164495, 164713, 164932, 165150, 165369, 165587, 165806, 166024, 166242, 166243, 166461, 166679, 166898, 167116, 167335, 167553, 167772, 167990, 168209, 168427, 168645, 168864, 169082, 169301, 169519, 169738, 169956, 170175, 170393, 170612, 170830, 171048, 171267, 171485, 171704, 171922, 172141, 172359, 172578, 172796, 173015, 173233, 173451, 173670, 173888, 174107, 174325, 174544, 174762, 174981, 175199, 175418, 175636, 175854, 176073, 176291, 176510, 176728, 176947, 177165, 177384, 177602, 177821, 178039, 178257, 178476, 178694, 178913, 179131, 179350, 179568, 179787, 180005, 180223, 180224, 180442, 180660, 180879, 181097, 181316, 181534, 181753, 181971, 182190, 182408, 182626, 182627, 182845, 183063, 183282, 183500, 183719, 183937, 184156, 184374, 184593, 184811, 185029, 185248, 185466, 185685, 185903, 186122, 186340, 186559, 186777, 186996, 187214, 187432, 187651, 187869, 188088, 188306, 188525, 188743, 188962, 189180, 189399, 189617, 189835, 190054, 190272, 190491, 190709, 190928, 191146, 191365, 191583, 191802, 192020, 192238, 192457, 192675, 192894, 193112, 193331, 193549, 193768, 193986, 194205, 194423, 194641, 194860, 195078, 195297, 195515, 195734, 195952, 196171, 196389, 196607, 196608, 196826, 197044, 197263, 197481, 197700, 197918, 198137, 198355, 198574, 198792, 199010, 199011, 199229, 199447, 199666, 199884, 200103, 200321, 200540, 200758, 200977, 201195, 201413, 201632, 201850, 202069, 202287, 202506, 202724, 202943, 203161, 203380, 203598, 203816, 204035, 204253, 204472, 204690, 204909, 205127, 205346, 205564, 205783, 206001, 206219, 206438, 206656, 206875, 207093, 207312, 207530, 207749, 207967, 208186, 208404, 208622, 208841, 209059, 209278, 209496, 209715, 209933, 210152, 210370, 210589, 210807, 211025, 211244, 211462, 211681, 211899, 212118, 212336, 212555, 212773, 212991, 212992, 213210, 213428, 213647, 213865, 214084, 214302, 214521, 214739, 214958, 215176, 215394, 215395, 215613, 215831, 216050, 216268, 216487, 216705, 216924, 217142, 217361, 217579, 217797, 218016, 218234, 218453, 218671, 218890, 219108, 219327, 219545, 219764, 219982, 220200, 220419, 220637, 220856, 221074, 221293, 221511, 221730, 221948, 222167, 222385, 222603, 222822, 223040, 223259, 223477, 223696, 223914, 224133, 224351, 224570, 224788, 225006, 225225, 225443, 225662, 225880, 226099, 226317, 226536, 226754, 226973, 227191, 227409, 227628, 227846, 228065, 228283, 228502, 228720, 228939, 229157, 229375, 229376, 229594, 229812, 230031, 230249, 230468, 230686, 230905, 231123, 231342, 231560, 231778, 231779, 231997, 232215, 232434, 232652, 232871, 233089, 233308, 233526, 233745, 233963, 234181, 234400, 234618, 234837, 235055, 235274, 235492, 235711, 235929, 236148, 236366, 236584, 236803, 237021, 237240, 237458, 237677, 237895, 238114, 238332, 238551, 238769, 238987, 239206, 239424, 239643, 239861, 240080, 240298, 240517, 240735, 240954, 241172, 241390, 241609, 241827, 242046, 242264, 242483, 242701, 242920, 243138, 243357, 243575, 243793, 244012, 244230, 244449, 244667, 244886, 245104, 245323, 245541, 245760, 245978, 246196, 246415, 246633, 246852, 247070, 247289, 247507, 247726, 247944, 248162, 248163, 248381, 248599, 248818, 249036, 249255, 249473, 249692, 249910, 250129, 250347, 250565, 250784, 251002, 251221, 251439, 251658, 251876, 252095, 252313, 252532, 252750, 252968, 253187, 253405, 253624, 253842, 254061, 254279, 254498, 254716, 254935, 255153, 255371, 255590, 255808, 256027, 256245, 256464, 256682, 256901, 257119, 257338, 257556, 257774, 257993, 258211, 258430, 258648, 258867, 259085, 259304, 259522, 259741, 259959, 260177, 260396, 260614, 260833, 261051, 261270, 261488, 261707, 261925, 262143, 262144, 262580, 263017, 263454, 263891, 264328, 264765, 265202, 265639, 266076, 266513, 266949, 266950, 267386, 267823, 268260, 268697, 269134, 269571, 270008, 270445, 270882, 271319, 271755, 272192, 272629, 273066, 273503, 273940, 274377, 274814, 275251, 275688, 276125, 276561, 276998, 277435, 277872, 278309, 278746, 279183, 279620, 280057, 280494, 280930, 280931, 281367, 281804, 282241, 282678, 283115, 283552, 283989, 284426, 284863, 285300, 285736, 286173, 286610, 287047, 287484, 287921, 288358, 288795, 289232, 289669, 290106, 290542, 290979, 291416, 291853, 292290, 292727, 293164, 293601, 294038, 294475, 294911, 294912, 295348, 295785, 296222, 296659, 297096, 297533, 297970, 298407, 298844, 299281, 299717, 299718, 300154, 300591, 301028, 301465, 301902, 302339, 302776, 303213, 303650, 304087, 304523, 304960, 305397, 305834, 306271, 306708, 307145, 307582, 308019, 308456, 308893, 309329, 309766, 310203, 310640, 311077, 311514, 311951, 312388, 312825, 313262, 313698, 313699, 314135, 314572, 315009, 315446, 315883, 316320, 316757, 317194, 317631, 318068, 318504, 318941, 319378, 319815, 320252, 320689, 321126, 321563, 322000, 322437, 322874, 323310, 323747, 324184, 324621, 325058, 325495, 325932, 326369, 326806, 327243, 327679, 327680, 328116, 328553, 328990, 329427, 329864, 330301, 330738, 331175, 331612, 332049, 332485, 332486, 332922, 333359, 333796, 334233, 334670, 335107, 335544, 335981, 336418, 336855, 337291, 337728, 338165, 338602, 339039, 339476, 339913, 340350, 340787, 341224, 341661, 342097, 342534, 342971, 343408, 343845, 344282, 344719, 345156, 345593, 346030, 346466, 346467, 346903, 347340, 347777, 348214, 348651, 349088, 349525, 349962, 350399, 350836, 351272, 351709, 352146, 352583, 353020, 353457, 353894, 354331, 354768, 355205, 355642, 356078, 356515, 356952, 357389, 357826, 358263, 358700, 359137, 359574, 360011, 360447, 360448, 360884, 361321, 361758, 362195, 362632, 363069, 363506, 363943, 364380, 364817, 365253, 365254, 365690, 366127, 366564, 367001, 367438, 367875, 368312, 368749, 369186, 369623, 370059, 370496, 370933, 371370, 371807, 372244, 372681, 373118, 373555, 373992, 374429, 374865, 375302, 375739, 376176, 376613, 377050, 377487, 377924, 378361, 378798, 379234, 379235, 379671, 380108, 380545, 380982, 381419, 381856, 382293, 382730, 383167, 383604, 384040, 384477, 384914, 385351, 385788, 386225, 386662, 387099, 387536, 387973, 388410, 388846, 389283, 389720, 390157, 390594, 391031, 391468, 391905, 392342, 392779, 393215, 393216, 393652, 394089, 394526, 394963, 395400, 395837, 396274, 396711, 397148, 397585, 398021, 398022, 398458, 398895, 399332, 399769, 400206, 400643, 401080, 401517, 401954, 402391, 402827, 403264, 403701, 404138, 404575, 405012, 405449, 405886, 406323, 406760, 407197, 407633, 408070, 408507, 408944, 409381, 409818, 410255, 410692, 411129, 411566, 412002, 412003, 412439, 412876, 413313, 413750, 414187, 414624, 415061, 415498, 415935, 416372, 416808, 417245, 417682, 418119, 418556, 418993, 419430, 419867, 420304, 420741, 421178, 421614, 422051, 422488, 422925, 423362, 423799, 424236, 424673, 425110, 425547, 425983, 425984, 426420, 426857, 427294, 427731, 428168, 428605, 429042, 429479, 429916, 430353, 430789, 430790, 431226, 431663, 432100, 432537, 432974, 433411, 433848, 434285, 434722, 435159, 435595, 436032, 436469, 436906, 437343, 437780, 438217, 438654, 439091, 439528, 439965, 440401, 440838, 441275, 441712, 442149, 442586, 443023, 443460, 443897, 444334, 444770, 444771, 445207, 445644, 446081, 446518, 446955, 447392, 447829, 448266, 448703, 449140, 449576, 450013, 450450, 450887, 451324, 451761, 452198, 452635, 453072, 453509, 453946, 454382, 454819, 455256, 455693, 456130, 456567, 457004, 457441, 457878, 458315, 458751, 458752, 459188, 459625, 460062, 460499, 460936, 461373, 461810, 462247, 462684, 463121, 463557, 463558, 463994, 464431, 464868, 465305, 465742, 466179, 466616, 467053, 467490, 467927, 468363, 468800, 469237, 469674, 470111, 470548, 470985, 471422, 471859, 472296, 472733, 473169, 473606, 474043, 474480, 474917, 475354, 475791, 476228, 476665, 477102, 477538, 477539, 477975, 478412, 478849, 479286, 479723, 480160, 480597, 481034, 481471, 481908, 482344, 482781, 483218, 483655, 484092, 484529, 484966, 485403, 485840, 486277, 486714, 487150, 487587, 488024, 488461, 488898, 489335, 489772, 490209, 490646, 491083, 491520, 491956, 492393, 492830, 493267, 493704, 494141, 494578, 495015, 495452, 495889, 496325, 496326, 496762, 497199, 497636, 498073, 498510, 498947, 499384, 499821, 500258, 500695, 501131, 501568, 502005, 502442, 502879, 503316, 503753, 504190, 504627, 505064, 505501, 505937, 506374, 506811, 507248, 507685, 508122, 508559, 508996, 509433, 509870, 510306, 510307, 510743, 511180, 511617, 512054, 512491, 512928, 513365, 513802, 514239, 514676, 515112, 515549, 515986, 516423, 516860, 517297, 517734, 518171, 518608, 519045, 519482, 519918, 520355, 520792, 521229, 521666, 522103, 522540, 522977, 523414, 523851, 524287, 524288, 525161, 526035, 526909, 527783, 528657, 529530, 530404, 531278, 532152, 533026, 533899, 533900, 534773, 535647, 536521, 537395, 538269, 539142, 540016, 540890, 541764, 542638, 543511, 544385, 545259, 546133, 547007, 547880, 547881, 548754, 549628, 550502, 551376, 552250, 553123, 553997, 554871, 555745, 556619, 557492, 558366, 559240, 560114, 560988, 561861, 561862, 562735, 563609, 564483, 565357, 566231, 567104, 567978, 568852, 569726, 570600, 571473, 572347, 573221, 574095, 574969, 575842, 575843, 576716, 577590, 578464, 579338, 580212, 581085, 581959, 582833, 583707, 584581, 585454, 586328, 587202, 588076, 588950, 589823, 589824, 590697, 591571, 592445, 593319, 594193, 595066, 595940, 596814, 597688, 598562, 599435, 599436, 600309, 601183, 602057, 602931, 603805, 604678, 605552, 606426, 607300, 608174, 609047, 609921, 610795, 611669, 612543, 613416, 613417, 614290, 615164, 616038, 616912, 617786, 618659, 619533, 620407, 621281, 622155, 623028, 623902, 624776, 625650, 626524, 627397, 627398, 628271, 629145, 630019, 630893, 631767, 632640, 633514, 634388, 635262, 636136, 637009, 637883, 638757, 639631, 640505, 641378, 641379, 642252, 643126, 644000, 644874, 645748, 646621, 647495, 648369, 649243, 650117, 650990, 651864, 652738, 653612, 654486, 655359, 655360, 656233, 657107, 657981, 658855, 659729, 660602, 661476, 662350, 663224, 664098, 664971, 664972, 665845, 666719, 667593, 668467, 669341, 670214, 671088, 671962, 672836, 673710, 674583, 675457, 676331, 677205, 678079, 678952, 678953, 679826, 680700, 681574, 682448, 683322, 684195, 685069, 685943, 686817, 687691, 688564, 689438, 690312, 691186, 692060, 692933, 692934, 693807, 694681, 695555, 696429, 697303, 698176, 699050, 699924, 700798, 701672, 702545, 703419, 704293, 705167, 706041, 706914, 706915, 707788, 708662, 709536, 710410, 711284, 712157, 713031, 713905, 714779, 715653, 716526, 717400, 718274, 719148, 720022, 720895, 720896, 721769, 722643, 723517, 724391, 725265, 726138, 727012, 727886, 728760, 729634, 730507, 730508, 731381, 732255, 733129, 734003, 734877, 735750, 736624, 737498, 738372, 739246, 740119, 740993, 741867, 742741, 743615, 744488, 744489, 745362, 746236, 747110, 747984, 748858, 749731, 750605, 751479, 752353, 753227, 754100, 754974, 755848, 756722, 757596, 758469, 758470, 759343, 760217, 761091, 761965, 762839, 763712, 764586, 765460, 766334, 767208, 768081, 768955, 769829, 770703, 771577, 772450, 772451, 773324, 774198, 775072, 775946, 776820, 777693, 778567, 779441, 780315, 781189, 782062, 782936, 783810, 784684, 785558, 786431, 786432, 787305, 788179, 789053, 789927, 790801, 791674, 792548, 793422, 794296, 795170, 796043, 796044, 796917, 797791, 798665, 799539, 800413, 801286, 802160, 803034, 803908, 804782, 805655, 806529, 807403, 808277, 809151, 810024, 810025, 810898, 811772, 812646, 813520, 814394, 815267, 816141, 817015, 817889, 818763, 819636, 820510, 821384, 822258, 823132, 824005, 824006, 824879, 825753, 826627, 827501, 828375, 829248, 830122, 830996, 831870, 832744, 833617, 834491, 835365, 836239, 837113, 837986, 837987, 838860, 839734, 840608, 841482, 842356, 843229, 844103, 844977, 845851, 846725, 847598, 848472, 849346, 850220, 851094, 851967, 851968, 852841, 853715, 854589, 855463, 856337, 857210, 858084, 858958, 859832, 860706, 861579, 861580, 862453, 863327, 864201, 865075, 865949, 866822, 867696, 868570, 869444, 870318, 871191, 872065, 872939, 873813, 874687, 875560, 875561, 876434, 877308, 878182, 879056, 879930, 880803, 881677, 882551, 883425, 884299, 885172, 886046, 886920, 887794, 888668, 889541, 889542, 890415, 891289, 892163, 893037, 893911, 894784, 895658, 896532, 897406, 898280, 899153, 900027, 900901, 901775, 902649, 903522, 903523, 904396, 905270, 906144, 907018, 907892, 908765, 909639, 910513, 911387, 912261, 913134, 914008, 914882, 915756, 916630, 917503, 917504, 918377, 919251, 920125, 920999, 921873, 922746, 923620, 924494, 925368, 926242, 927115, 927116, 927989, 928863, 929737, 930611, 931485, 932358, 933232, 934106, 934980, 935854, 936727, 937601, 938475, 939349, 940223, 941096, 941097, 941970, 942844, 943718, 944592, 945466, 946339, 947213, 948087, 948961, 949835, 950708, 951582, 952456, 953330, 954204, 955077, 955078, 955951, 956825, 957699, 958573, 959447, 960320, 961194, 962068, 962942, 963816, 964689, 965563, 966437, 967311, 968185, 969058, 969059, 969932, 970806, 971680, 972554, 973428, 974301, 975175, 976049, 976923, 977797, 978670, 979544, 980418, 981292, 982166, 983040, 983913, 984787, 985661, 986535, 987409, 988282, 989156, 990030, 990904, 991778, 992651, 992652, 993525, 994399, 995273, 996147, 997021, 997894, 998768, 999642, 1000516, 1001390, 1002263, 1003137, 1004011, 1004885, 1005759, 1006632, 1006633, 1007506, 1008380, 1009254, 1010128, 1011002, 1011875, 1012749, 1013623, 1014497, 1015371, 1016244, 1017118, 1017992, 1018866, 1019740, 1020613, 1020614, 1021487, 1022361, 1023235, 1024109, 1024983, 1025856, 1026730, 1027604, 1028478, 1029352, 1030225, 1031099, 1031973, 1032847, 1033721, 1034594, 1034595, 1035468, 1036342, 1037216, 1038090, 1038964, 1039837, 1040711, 1041585, 1042459, 1043333, 1044206, 1045080, 1045954, 1046828, 1047702, 1048575, 1048576, 1050323, 1052071, 1053818, 1053819, 1055566, 1057314, 1059061, 1060809, 1062557, 1064304, 1066052, 1067799, 1067800, 1069547, 1071295, 1073042, 1074790, 1076538, 1078285, 1080033, 1081780, 1081781, 1083528, 1085276, 1087023, 1088771, 1090519, 1092266, 1094014, 1095761, 1095762, 1097509, 1099257, 1101004, 1102752, 1104500, 1106247, 1107995, 1109742, 1109743, 1111490, 1113238, 1114985, 1116733, 1118481, 1120228, 1121976, 1123723, 1123724, 1125471, 1127219, 1128966, 1130714, 1132462, 1134209, 1135957, 1137704, 1137705, 1139452, 1141200, 1142947, 1144695, 1146443, 1148190, 1149938, 1151685, 1151686, 1153433, 1155181, 1156928, 1158676, 1160424, 1162171, 1163919, 1165666, 1165667, 1167414, 1169162, 1170909, 1172657, 1174405, 1176152, 1177900, 1179647, 1179648, 1181395, 1183143, 1184890, 1184891, 1186638, 1188386, 1190133, 1191881, 1193629, 1195376, 1197124, 1198871, 1198872, 1200619, 1202367, 1204114, 1205862, 1207610, 1209357, 1211105, 1212852, 1212853, 1214600, 1216348, 1218095, 1219843, 1221591, 1223338, 1225086, 1226833, 1226834, 1228581, 1230329, 1232076, 1233824, 1235572, 1237319, 1239067, 1240814, 1240815, 1242562, 1244310, 1246057, 1247805, 1249553, 1251300, 1253048, 1254795, 1254796, 1256543, 1258291, 1260038, 1261786, 1263534, 1265281, 1267029, 1268776, 1268777, 1270524, 1272272, 1274019, 1275767, 1277515, 1279262, 1281010, 1282757, 1282758, 1284505, 1286253, 1288000, 1289748, 1291496, 1293243, 1294991, 1296738, 1296739, 1298486, 1300234, 1301981, 1303729, 1305477, 1307224, 1308972, 1310719, 1310720, 1312467, 1314215, 1315962, 1315963, 1317710, 1319458, 1321205, 1322953, 1324701, 1326448, 1328196, 1329943, 1329944, 1331691, 1333439, 1335186, 1336934, 1338682, 1340429, 1342177, 1343924, 1343925, 1345672, 1347420, 1349167, 1350915, 1352663, 1354410, 1356158, 1357905, 1357906, 1359653, 1361401, 1363148, 1364896, 1366644, 1368391, 1370139, 1371886, 1371887, 1373634, 1375382, 1377129, 1378877, 1380625, 1382372, 1384120, 1385867, 1385868, 1387615, 1389363, 1391110, 1392858, 1394606, 1396353, 1398101, 1399848, 1399849, 1401596, 1403344, 1405091, 1406839, 1408587, 1410334, 1412082, 1413829, 1413830, 1415577, 1417325, 1419072, 1420820, 1422568, 1424315, 1426063, 1427810, 1427811, 1429558, 1431306, 1433053, 1434801, 1436549, 1438296, 1440044, 1441791, 1441792, 1443539, 1445287, 1447034, 1447035, 1448782, 1450530, 1452277, 1454025, 1455773, 1457520, 1459268, 1461015, 1461016, 1462763, 1464511, 1466258, 1468006, 1469754, 1471501, 1473249, 1474996, 1474997, 1476744, 1478492, 1480239, 1481987, 1483735, 1485482, 1487230, 1488977, 1488978, 1490725, 1492473, 1494220, 1495968, 1497716, 1499463, 1501211, 1502958, 1502959, 1504706, 1506454, 1508201, 1509949, 1511697, 1513444, 1515192, 1516939, 1516940, 1518687, 1520435, 1522182, 1523930, 1525678, 1527425, 1529173, 1530920, 1530921, 1532668, 1534416, 1536163, 1537911, 1539659, 1541406, 1543154, 1544901, 1544902, 1546649, 1548397, 1550144, 1551892, 1553640, 1555387, 1557135, 1558882, 1558883, 1560630, 1562378, 1564125, 1565873, 1567621, 1569368, 1571116, 1572863, 1572864, 1574611, 1576359, 1578106, 1578107, 1579854, 1581602, 1583349, 1585097, 1586845, 1588592, 1590340, 1592087, 1592088, 1593835, 1595583, 1597330, 1599078, 1600826, 1602573, 1604321, 1606068, 1606069, 1607816, 1609564, 1611311, 1613059, 1614807, 1616554, 1618302, 1620049, 1620050, 1621797, 1623545, 1625292, 1627040, 1628788, 1630535, 1632283, 1634030, 1634031, 1635778, 1637526, 1639273, 1641021, 1642769, 1644516, 1646264, 1648011, 1648012, 1649759, 1651507, 1653254, 1655002, 1656750, 1658497, 1660245, 1661992, 1661993, 1663740, 1665488, 1667235, 1668983, 1670731, 1672478, 1674226, 1675973, 1675974, 1677721, 1679469, 1681216, 1682964, 1684712, 1686459, 1688207, 1689954, 1689955, 1691702, 1693450, 1695197, 1696945, 1698693, 1700440, 1702188, 1703935, 1703936, 1705683, 1707431, 1709178, 1709179, 1710926, 1712674, 1714421, 1716169, 1717917, 1719664, 1721412, 1723159, 1723160, 1724907, 1726655, 1728402, 1730150, 1731898, 1733645, 1735393, 1737140, 1737141, 1738888, 1740636, 1742383, 1744131, 1745879, 1747626, 1749374, 1751121, 1751122, 1752869, 1754617, 1756364, 1758112, 1759860, 1761607, 1763355, 1765102, 1765103, 1766850, 1768598, 1770345, 1772093, 1773841, 1775588, 1777336, 1779083, 1779084, 1780831, 1782579, 1784326, 1786074, 1787822, 1789569, 1791317, 1793064, 1793065, 1794812, 1796560, 1798307, 1800055, 1801803, 1803550, 1805298, 1807045, 1807046, 1808793, 1810541, 1812288, 1814036, 1815784, 1817531, 1819279, 1821026, 1821027, 1822774, 1824522, 1826269, 1828017, 1829765, 1831512, 1833260, 1835007, 1835008, 1836755, 1838503, 1840250, 1840251, 1841998, 1843746, 1845493, 1847241, 1848989, 1850736, 1852484, 1854231, 1854232, 1855979, 1857727, 1859474, 1861222, 1862970, 1864717, 1866465, 1868212, 1868213, 1869960, 1871708, 1873455, 1875203, 1876951, 1878698, 1880446, 1882193, 1882194, 1883941, 1885689, 1887436, 1889184, 1890932, 1892679, 1894427, 1896174, 1896175, 1897922, 1899670, 1901417, 1903165, 1904913, 1906660, 1908408, 1910155, 1910156, 1911903, 1913651, 1915398, 1917146, 1918894, 1920641, 1922389, 1924136, 1924137, 1925884, 1927632, 1929379, 1931127, 1932875, 1934622, 1936370, 1938117, 1938118, 1939865, 1941613, 1943360, 1945108, 1946856, 1948603, 1950351, 1952098, 1952099, 1953846, 1955594, 1957341, 1959089, 1960837, 1962584, 1964332, 1966080, 1967827, 1969575, 1971322, 1971323, 1973070, 1974818, 1976565, 1978313, 1980061, 1981808, 1983556, 1985303, 1985304, 1987051, 1988799, 1990546, 1992294, 1994042, 1995789, 1997537, 1999284, 1999285, 2001032, 2002780, 2004527, 2006275, 2008023, 2009770, 2011518, 2013265, 2013266, 2015013, 2016761, 2018508, 2020256, 2022004, 2023751, 2025499, 2027246, 2027247, 2028994, 2030742, 2032489, 2034237, 2035985, 2037732, 2039480, 2041227, 2041228, 2042975, 2044723, 2046470, 2048218, 2049966, 2051713, 2053461, 2055208, 2055209, 2056956, 2058704, 2060451, 2062199, 2063947, 2065694, 2067442, 2069189, 2069190, 2070937, 2072685, 2074432, 2076180, 2077928, 2079675, 2081423, 2083170, 2083171, 2084918, 2086666, 2088413, 2090161, 2091909, 2093656, 2095404, 2097151, 2097152, 2100647, 2104142, 2107637, 2107638, 2111133, 2114628, 2118123, 2121618, 2121619, 2125114, 2128609, 2132104, 2135599, 2135600, 2139095, 2142590, 2146085, 2149580, 2149581, 2153076, 2156571, 2160066, 2163561, 2163562, 2167057, 2170552, 2174047, 2177542, 2177543, 2181038, 2184533, 2188028, 2191523, 2191524, 2195019, 2198514, 2202009, 2205504, 2205505, 2209000, 2212495, 2215990, 2219485, 2219486, 2222981, 2226476, 2229971, 2233466, 2233467, 2236962, 2240457, 2243952, 2247447, 2247448, 2250943, 2254438, 2257933, 2261428, 2261429, 2264924, 2268419, 2271914, 2275409, 2275410, 2278905, 2282400, 2285895, 2289390, 2289391, 2292886, 2296381, 2299876, 2303371, 2303372, 2306867, 2310362, 2313857, 2317352, 2317353, 2320848, 2324343, 2327838, 2331333, 2331334, 2334829, 2338324, 2341819, 2345314, 2345315, 2348810, 2352305, 2355800, 2359295, 2359296, 2362791, 2366286, 2369781, 2369782, 2373277, 2376772, 2380267, 2383762, 2383763, 2387258, 2390753, 2394248, 2397743, 2397744, 2401239, 2404734, 2408229, 2411724, 2411725, 2415220, 2418715, 2422210, 2425705, 2425706, 2429201, 2432696, 2436191, 2439686, 2439687, 2443182, 2446677, 2450172, 2453667, 2453668, 2457163, 2460658, 2464153, 2467648, 2467649, 2471144, 2474639, 2478134, 2481629, 2481630, 2485125, 2488620, 2492115, 2495610, 2495611, 2499106, 2502601, 2506096, 2509591, 2509592, 2513087, 2516582, 2520077, 2523572, 2523573, 2527068, 2530563, 2534058, 2537553, 2537554, 2541049, 2544544, 2548039, 2551534, 2551535, 2555030, 2558525, 2562020, 2565515, 2565516, 2569011, 2572506, 2576001, 2579496, 2579497, 2582992, 2586487, 2589982, 2593477, 2593478, 2596973, 2600468, 2603963, 2607458, 2607459, 2610954, 2614449, 2617944, 2621439, 2621440, 2624935, 2628430, 2631925, 2631926, 2635421, 2638916, 2642411, 2645906, 2645907, 2649402, 2652897, 2656392, 2659887, 2659888, 2663383, 2666878, 2670373, 2673868, 2673869, 2677364, 2680859, 2684354, 2687849, 2687850, 2691345, 2694840, 2698335, 2701830, 2701831, 2705326, 2708821, 2712316, 2715811, 2715812, 2719307, 2722802, 2726297, 2729792, 2729793, 2733288, 2736783, 2740278, 2743773, 2743774, 2747269, 2750764, 2754259, 2757754, 2757755, 2761250, 2764745, 2768240, 2771735, 2771736, 2775231, 2778726, 2782221, 2785716, 2785717, 2789212, 2792707, 2796202, 2799697, 2799698, 2803193, 2806688, 2810183, 2813678, 2813679, 2817174, 2820669, 2824164, 2827659, 2827660, 2831155, 2834650, 2838145, 2841640, 2841641, 2845136, 2848631, 2852126, 2855621, 2855622, 2859117, 2862612, 2866107, 2869602, 2869603, 2873098, 2876593, 2880088, 2883583, 2883584, 2887079, 2890574, 2894069, 2894070, 2897565, 2901060, 2904555, 2908050, 2908051, 2911546, 2915041, 2918536, 2922031, 2922032, 2925527, 2929022, 2932517, 2936012, 2936013, 2939508, 2943003, 2946498, 2949993, 2949994, 2953489, 2956984, 2960479, 2963974, 2963975, 2967470, 2970965, 2974460, 2977955, 2977956, 2981451, 2984946, 2988441, 2991936, 2991937, 2995432, 2998927, 3002422, 3005917, 3005918, 3009413, 3012908, 3016403, 3019898, 3019899, 3023394, 3026889, 3030384, 3033879, 3033880, 3037375, 3040870, 3044365, 3047860, 3047861, 3051356, 3054851, 3058346, 3061841, 3061842, 3065337, 3068832, 3072327, 3075822, 3075823, 3079318, 3082813, 3086308, 3089803, 3089804, 3093299, 3096794, 3100289, 3103784, 3103785, 3107280, 3110775, 3114270, 3117765, 3117766, 3121261, 3124756, 3128251, 3131746, 3131747, 3135242, 3138737, 3142232, 3145727, 3145728, 3149223, 3152718, 3156213, 3156214, 3159709, 3163204, 3166699, 3170194, 3170195, 3173690, 3177185, 3180680, 3184175, 3184176, 3187671, 3191166, 3194661, 3198156, 3198157, 3201652, 3205147, 3208642, 3212137, 3212138, 3215633, 3219128, 3222623, 3226118, 3226119, 3229614, 3233109, 3236604, 3240099, 3240100, 3243595, 3247090, 3250585, 3254080, 3254081, 3257576, 3261071, 3264566, 3268061, 3268062, 3271557, 3275052, 3278547, 3282042, 3282043, 3285538, 3289033, 3292528, 3296023, 3296024, 3299519, 3303014, 3306509, 3310004, 3310005, 3313500, 3316995, 3320490, 3323985, 3323986, 3327481, 3330976, 3334471, 3337966, 3337967, 3341462, 3344957, 3348452, 3351947, 3351948, 3355443, 3358938, 3362433, 3365928, 3365929, 3369424, 3372919, 3376414, 3379909, 3379910, 3383405, 3386900, 3390395, 3393890, 3393891, 3397386, 3400881, 3404376, 3407871, 3407872, 3411367, 3414862, 3418357, 3418358, 3421853, 3425348, 3428843, 3432338, 3432339, 3435834, 3439329, 3442824, 3446319, 3446320, 3449815, 3453310, 3456805, 3460300, 3460301, 3463796, 3467291, 3470786, 3474281, 3474282, 3477777, 3481272, 3484767, 3488262, 3488263, 3491758, 3495253, 3498748, 3502243, 3502244, 3505739, 3509234, 3512729, 3516224, 3516225, 3519720, 3523215, 3526710, 3530205, 3530206, 3533701, 3537196, 3540691, 3544186, 3544187, 3547682, 3551177, 3554672, 3558167, 3558168, 3561663, 3565158, 3568653, 3572148, 3572149, 3575644, 3579139, 3582634, 3586129, 3586130, 3589625, 3593120, 3596615, 3600110, 3600111, 3603606, 3607101, 3610596, 3614091, 3614092, 3617587, 3621082, 3624577, 3628072, 3628073, 3631568, 3635063, 3638558, 3642053, 3642054, 3645549, 3649044, 3652539, 3656034, 3656035, 3659530, 3663025, 3666520, 3670015, 3670016, 3673511, 3677006, 3680501, 3680502, 3683997, 3687492, 3690987, 3694482, 3694483, 3697978, 3701473, 3704968, 3708463, 3708464, 3711959, 3715454, 3718949, 3722444, 3722445, 3725940, 3729435, 3732930, 3736425, 3736426, 3739921, 3743416, 3746911, 3750406, 3750407, 3753902, 3757397, 3760892, 3764387, 3764388, 3767883, 3771378, 3774873, 3778368, 3778369, 3781864, 3785359, 3788854, 3792349, 3792350, 3795845, 3799340, 3802835, 3806330, 3806331, 3809826, 3813321, 3816816, 3820311, 3820312, 3823807, 3827302, 3830797, 3834292, 3834293, 3837788, 3841283, 3844778, 3848273, 3848274, 3851769, 3855264, 3858759, 3862254, 3862255, 3865750, 3869245, 3872740, 3876235, 3876236, 3879731, 3883226, 3886721, 3890216, 3890217, 3893712, 3897207, 3900702, 3904197, 3904198, 3907693, 3911188, 3914683, 3918178, 3918179, 3921674, 3925169, 3928664, 3932160, 3935655, 3939150, 3942645, 3942646, 3946141, 3949636, 3953131, 3956626, 3956627, 3960122, 3963617, 3967112, 3970607, 3970608, 3974103, 3977598, 3981093, 3984588, 3984589, 3988084, 3991579, 3995074, 3998569, 3998570, 4002065, 4005560, 4009055, 4012550, 4012551, 4016046, 4019541, 4023036, 4026531, 4026532, 4030027, 4033522, 4037017, 4040512, 4040513, 4044008, 4047503, 4050998, 4054493, 4054494, 4057989, 4061484, 4064979, 4068474, 4068475, 4071970, 4075465, 4078960, 4082455, 4082456, 4085951, 4089446, 4092941, 4096436, 4096437, 4099932, 4103427, 4106922, 4110417, 4110418, 4113913, 4117408, 4120903, 4124398, 4124399, 4127894, 4131389, 4134884, 4138379, 4138380, 4141875, 4145370, 4148865, 4152360, 4152361, 4155856, 4159351, 4162846, 4166341, 4166342, 4169837, 4173332, 4176827, 4180322, 4180323, 4183818, 4187313, 4190808, 4194303, 4194304, 4201294, 4201295, 4208285, 4215275, 4215276, 4222266, 4229256, 4229257, 4236247, 4243237, 4243238, 4250228, 4257218, 4257219, 4264209, 4271199, 4271200, 4278190, 4285180, 4285181, 4292171, 4299161, 4299162, 4306152, 4313142, 4313143, 4320133, 4327123, 4327124, 4334114, 4341104, 4341105, 4348095, 4355085, 4355086, 4362076, 4369066, 4369067, 4376057, 4383047, 4383048, 4390038, 4397028, 4397029, 4404019, 4411009, 4411010, 4418000, 4424990, 4424991, 4431981, 4438971, 4438972, 4445962, 4452952, 4452953, 4459943, 4466933, 4466934, 4473924, 4480914, 4480915, 4487905, 4494895, 4494896, 4501886, 4508876, 4508877, 4515867, 4522857, 4522858, 4529848, 4536838, 4536839, 4543829, 4550819, 4550820, 4557810, 4564800, 4564801, 4571791, 4578781, 4578782, 4585772, 4592762, 4592763, 4599753, 4606743, 4606744, 4613734, 4620724, 4620725, 4627715, 4634705, 4634706, 4641696, 4648686, 4648687, 4655677, 4662667, 4662668, 4669658, 4676648, 4676649, 4683639, 4690629, 4690630, 4697620, 4704610, 4704611, 4711601, 4718591, 4718592, 4725582, 4725583, 4732573, 4739563, 4739564, 4746554, 4753544, 4753545, 4760535, 4767525, 4767526, 4774516, 4781506, 4781507, 4788497, 4795487, 4795488, 4802478, 4809468, 4809469, 4816459, 4823449, 4823450, 4830440, 4837430, 4837431, 4844421, 4851411, 4851412, 4858402, 4865392, 4865393, 4872383, 4879373, 4879374, 4886364, 4893354, 4893355, 4900345, 4907335, 4907336, 4914326, 4921316, 4921317, 4928307, 4935297, 4935298, 4942288, 4949278, 4949279, 4956269, 4963259, 4963260, 4970250, 4977240, 4977241, 4984231, 4991221, 4991222, 4998212, 5005202, 5005203, 5012193, 5019183, 5019184, 5026174, 5033164, 5033165, 5040155, 5047145, 5047146, 5054136, 5061126, 5061127, 5068117, 5075107, 5075108, 5082098, 5089088, 5089089, 5096079, 5103069, 5103070, 5110060, 5117050, 5117051, 5124041, 5131031, 5131032, 5138022, 5145012, 5145013, 5152003, 5158993, 5158994, 5165984, 5172974, 5172975, 5179965, 5186955, 5186956, 5193946, 5200936, 5200937, 5207927, 5214917, 5214918, 5221908, 5228898, 5228899, 5235889, 5242879, 5242880, 5249870, 5249871, 5256861, 5263851, 5263852, 5270842, 5277832, 5277833, 5284823, 5291813, 5291814, 5298804, 5305794, 5305795, 5312785, 5319775, 5319776, 5326766, 5333756, 5333757, 5340747, 5347737, 5347738, 5354728, 5361718, 5361719, 5368709, 5375699, 5375700, 5382690, 5389680, 5389681, 5396671, 5403661, 5403662, 5410652, 5417642, 5417643, 5424633, 5431623, 5431624, 5438614, 5445604, 5445605, 5452595, 5459585, 5459586, 5466576, 5473566, 5473567, 5480557, 5487547, 5487548, 5494538, 5501528, 5501529, 5508519, 5515509, 5515510, 5522500, 5529490, 5529491, 5536481, 5543471, 5543472, 5550462, 5557452, 5557453, 5564443, 5571433, 5571434, 5578424, 5585414, 5585415, 5592405, 5599395, 5599396, 5606386, 5613376, 5613377, 5620367, 5627357, 5627358, 5634348, 5641338, 5641339, 5648329, 5655319, 5655320, 5662310, 5669300, 5669301, 5676291, 5683281, 5683282, 5690272, 5697262, 5697263, 5704253, 5711243, 5711244, 5718234, 5725224, 5725225, 5732215, 5739205, 5739206, 5746196, 5753186, 5753187, 5760177, 5767167, 5767168, 5774158, 5774159, 5781149, 5788139, 5788140, 5795130, 5802120, 5802121, 5809111, 5816101, 5816102, 5823092, 5830082, 5830083, 5837073, 5844063, 5844064, 5851054, 5858044, 5858045, 5865035, 5872025, 5872026, 5879016, 5886006, 5886007, 5892997, 5899987, 5899988, 5906978, 5913968, 5913969, 5920959, 5927949, 5927950, 5934940, 5941930, 5941931, 5948921, 5955911, 5955912, 5962902, 5969892, 5969893, 5976883, 5983873, 5983874, 5990864, 5997854, 5997855, 6004845, 6011835, 6011836, 6018826, 6025816, 6025817, 6032807, 6039797, 6039798, 6046788, 6053778, 6053779, 6060769, 6067759, 6067760, 6074750, 6081740, 6081741, 6088731, 6095721, 6095722, 6102712, 6109702, 6109703, 6116693, 6123683, 6123684, 6130674, 6137664, 6137665, 6144655, 6151645, 6151646, 6158636, 6165626, 6165627, 6172617, 6179607, 6179608, 6186598, 6193588, 6193589, 6200579, 6207569, 6207570, 6214560, 6221550, 6221551, 6228541, 6235531, 6235532, 6242522, 6249512, 6249513, 6256503, 6263493, 6263494, 6270484, 6277474, 6277475, 6284465, 6291455, 6291456, 6298446, 6298447, 6305437, 6312427, 6312428, 6319418, 6326408, 6326409, 6333399, 6340389, 6340390, 6347380, 6354370, 6354371, 6361361, 6368351, 6368352, 6375342, 6382332, 6382333, 6389323, 6396313, 6396314, 6403304, 6410294, 6410295, 6417285, 6424275, 6424276, 6431266, 6438256, 6438257, 6445247, 6452237, 6452238, 6459228, 6466218, 6466219, 6473209, 6480199, 6480200, 6487190, 6494180, 6494181, 6501171, 6508161, 6508162, 6515152, 6522142, 6522143, 6529133, 6536123, 6536124, 6543114, 6550104, 6550105, 6557095, 6564085, 6564086, 6571076, 6578066, 6578067, 6585057, 6592047, 6592048, 6599038, 6606028, 6606029, 6613019, 6620009, 6620010, 6627000, 6633990, 6633991, 6640981, 6647971, 6647972, 6654962, 6661952, 6661953, 6668943, 6675933, 6675934, 6682924, 6689914, 6689915, 6696905, 6703895, 6703896, 6710886, 6717876, 6717877, 6724867, 6731857, 6731858, 6738848, 6745838, 6745839, 6752829, 6759819, 6759820, 6766810, 6773800, 6773801, 6780791, 6787781, 6787782, 6794772, 6801762, 6801763, 6808753, 6815743, 6815744, 6822734, 6822735, 6829725, 6836715, 6836716, 6843706, 6850696, 6850697, 6857687, 6864677, 6864678, 6871668, 6878658, 6878659, 6885649, 6892639, 6892640, 6899630, 6906620, 6906621, 6913611, 6920601, 6920602, 6927592, 6934582, 6934583, 6941573, 6948563, 6948564, 6955554, 6962544, 6962545, 6969535, 6976525, 6976526, 6983516, 6990506, 6990507, 6997497, 7004487, 7004488, 7011478, 7018468, 7018469, 7025459, 7032449, 7032450, 7039440, 7046430, 7046431, 7053421, 7060411, 7060412, 7067402, 7074392, 7074393, 7081383, 7088373, 7088374, 7095364, 7102354, 7102355, 7109345, 7116335, 7116336, 7123326, 7130316, 7130317, 7137307, 7144297, 7144298, 7151288, 7158278, 7158279, 7165269, 7172259, 7172260, 7179250, 7186240, 7186241, 7193231, 7200221, 7200222, 7207212, 7214202, 7214203, 7221193, 7228183, 7228184, 7235174, 7242164, 7242165, 7249155, 7256145, 7256146, 7263136, 7270126, 7270127, 7277117, 7284107, 7284108, 7291098, 7298088, 7298089, 7305079, 7312069, 7312070, 7319060, 7326050, 7326051, 7333041, 7340031, 7340032, 7347022, 7347023, 7354013, 7361003, 7361004, 7367994, 7374984, 7374985, 7381975, 7388965, 7388966, 7395956, 7402946, 7402947, 7409937, 7416927, 7416928, 7423918, 7430908, 7430909, 7437899, 7444889, 7444890, 7451880, 7458870, 7458871, 7465861, 7472851, 7472852, 7479842, 7486832, 7486833, 7493823, 7500813, 7500814, 7507804, 7514794, 7514795, 7521785, 7528775, 7528776, 7535766, 7542756, 7542757, 7549747, 7556737, 7556738, 7563728, 7570718, 7570719, 7577709, 7584699, 7584700, 7591690, 7598680, 7598681, 7605671, 7612661, 7612662, 7619652, 7626642, 7626643, 7633633, 7640623, 7640624, 7647614, 7654604, 7654605, 7661595, 7668585, 7668586, 7675576, 7682566, 7682567, 7689557, 7696547, 7696548, 7703538, 7710528, 7710529, 7717519, 7724509, 7724510, 7731500, 7738490, 7738491, 7745481, 7752471, 7752472, 7759462, 7766452, 7766453, 7773443, 7780433, 7780434, 7787424, 7794414, 7794415, 7801405, 7808395, 7808396, 7815386, 7822376, 7822377, 7829367, 7836357, 7836358, 7843348, 7850338, 7850339, 7857329, 7864320, 7871310, 7871311, 7878301, 7885291, 7885292, 7892282, 7899272, 7899273, 7906263, 7913253, 7913254, 7920244, 7927234, 7927235, 7934225, 7941215, 7941216, 7948206, 7955196, 7955197, 7962187, 7969177, 7969178, 7976168, 7983158, 7983159, 7990149, 7997139, 7997140, 8004130, 8011120, 8011121, 8018111, 8025101, 8025102, 8032092, 8039082, 8039083, 8046073, 8053063, 8053064, 8060054, 8067044, 8067045, 8074035, 8081025, 8081026, 8088016, 8095006, 8095007, 8101997, 8108987, 8108988, 8115978, 8122968, 8122969, 8129959, 8136949, 8136950, 8143940, 8150930, 8150931, 8157921, 8164911, 8164912, 8171902, 8178892, 8178893, 8185883, 8192873, 8192874, 8199864, 8206854, 8206855, 8213845, 8220835, 8220836, 8227826, 8234816, 8234817, 8241807, 8248797, 8248798, 8255788, 8262778, 8262779, 8269769, 8276759, 8276760, 8283750, 8290740, 8290741, 8297731, 8304721, 8304722, 8311712, 8318702, 8318703, 8325693, 8332683, 8332684, 8339674, 8346664, 8346665, 8353655, 8360645, 8360646, 8367636, 8374626, 8374627, 8381617, 8388607) ORDER BY i ASC ;'
r1 = await pool.query(sql1);

sql2 = 'SELECT i, minvd, maxvd FROM mock4_om3 where i in (1024, 1025, 1027, 1029, 1030, 1032, 1034, 1035, 1037, 1039, 1041, 1042, 1044, 1046, 1047, 1049, 1051, 1053, 1054, 1056, 1058, 1059, 1061, 1063, 1064, 1066, 1068, 1070, 1071, 1073, 1075, 1076, 1078, 1080, 1082, 1083, 1085, 1087, 1088, 1090, 1092, 1093, 1095, 1097, 1099, 1100, 1102, 1104, 1105, 1107, 1109, 1111, 1112, 1114, 1116, 1117, 1119, 1121, 1122, 1124, 1126, 1128, 1129, 1131, 1133, 1134, 1136, 1138, 1140, 1141, 1143, 1145, 1146, 1148, 1150, 1151, 1152, 1153, 1155, 1157, 1158, 1160, 1162, 1163, 1165, 1167, 1169, 1170, 1172, 1174, 1175, 1177, 1179, 1181, 1182, 1184, 1186, 1187, 1189, 1191, 1192, 1194, 1196, 1198, 1199, 1201, 1203, 1204, 1206, 1208, 1210, 1211, 1213, 1215, 1216, 1218, 1220, 1221, 1223, 1225, 1227, 1228, 1230, 1232, 1233, 1235, 1237, 1239, 1240, 1242, 1244, 1245, 1247, 1249, 1250, 1252, 1254, 1256, 1257, 1259, 1261, 1262, 1264, 1266, 1268, 1269, 1271, 1273, 1274, 1276, 1278, 1279, 1280, 1281, 1283, 1285, 1286, 1288, 1290, 1291, 1293, 1295, 1297, 1298, 1300, 1302, 1303, 1305, 1307, 1309, 1310, 1312, 1314, 1315, 1317, 1319, 1320, 1322, 1324, 1326, 1327, 1329, 1331, 1332, 1334, 1336, 1338, 1339, 1341, 1343, 1344, 1346, 1348, 1349, 1351, 1353, 1355, 1356, 1358, 1360, 1361, 1363, 1365, 1367, 1368, 1370, 1372, 1373, 1375, 1377, 1378, 1380, 1382, 1384, 1385, 1387, 1389, 1390, 1392, 1394, 1396, 1397, 1399, 1401, 1402, 1404, 1406, 1407, 1408, 1409, 1411, 1413, 1414, 1416, 1418, 1419, 1421, 1423, 1425, 1426, 1428, 1430, 1431, 1433, 1435, 1437, 1438, 1440, 1442, 1443, 1445, 1447, 1448, 1450, 1452, 1454, 1455, 1457, 1459, 1460, 1462, 1464, 1466, 1467, 1469, 1471, 1472, 1474, 1476, 1477, 1479, 1481, 1483, 1484, 1486, 1488, 1489, 1491, 1493, 1495, 1496, 1498, 1500, 1501, 1503, 1505, 1506, 1508, 1510, 1512, 1513, 1515, 1517, 1518, 1520, 1522, 1524, 1525, 1527, 1529, 1530, 1532, 1534, 1535, 1536, 1537, 1539, 1541, 1542, 1544, 1546, 1547, 1549, 1551, 1553, 1554, 1556, 1558, 1559, 1561, 1563, 1565, 1566, 1568, 1570, 1571, 1573, 1575, 1576, 1578, 1580, 1582, 1583, 1585, 1587, 1588, 1590, 1592, 1594, 1595, 1597, 1599, 1600, 1602, 1604, 1605, 1607, 1609, 1611, 1612, 1614, 1616, 1617, 1619, 1621, 1623, 1624, 1626, 1628, 1629, 1631, 1633, 1634, 1636, 1638, 1640, 1641, 1643, 1645, 1646, 1648, 1650, 1652, 1653, 1655, 1657, 1658, 1660, 1662, 1663, 1664, 1665, 1667, 1669, 1670, 1672, 1674, 1675, 1677, 1679, 1681, 1682, 1684, 1686, 1687, 1689, 1691, 1693, 1694, 1696, 1698, 1699, 1701, 1703, 1704, 1706, 1708, 1710, 1711, 1713, 1715, 1716, 1718, 1720, 1722, 1723, 1725, 1727, 1728, 1730, 1732, 1733, 1735, 1737, 1739, 1740, 1742, 1744, 1745, 1747, 1749, 1751, 1752, 1754, 1756, 1757, 1759, 1761, 1762, 1764, 1766, 1768, 1769, 1771, 1773, 1774, 1776, 1778, 1780, 1781, 1783, 1785, 1786, 1788, 1790, 1791, 1792, 1793, 1795, 1797, 1798, 1800, 1802, 1803, 1805, 1807, 1809, 1810, 1812, 1814, 1815, 1817, 1819, 1821, 1822, 1824, 1826, 1827, 1829, 1831, 1832, 1834, 1836, 1838, 1839, 1841, 1843, 1844, 1846, 1848, 1850, 1851, 1853, 1855, 1856, 1858, 1860, 1861, 1863, 1865, 1867, 1868, 1870, 1872, 1873, 1875, 1877, 1879, 1880, 1882, 1884, 1885, 1887, 1889, 1890, 1892, 1894, 1896, 1897, 1899, 1901, 1902, 1904, 1906, 1908, 1909, 1911, 1913, 1914, 1916, 1918, 1920, 1921, 1923, 1925, 1926, 1928, 1930, 1931, 1933, 1935, 1937, 1938, 1940, 1942, 1943, 1945, 1947, 1949, 1950, 1952, 1954, 1955, 1957, 1959, 1960, 1962, 1964, 1966, 1967, 1969, 1971, 1972, 1974, 1976, 1978, 1979, 1981, 1983, 1984, 1986, 1988, 1989, 1991, 1993, 1995, 1996, 1998, 2000, 2001, 2003, 2005, 2007, 2008, 2010, 2012, 2013, 2015, 2017, 2018, 2020, 2022, 2024, 2025, 2027, 2029, 2030, 2032, 2034, 2036, 2037, 2039, 2041, 2042, 2044, 2046, 2047, 2048, 2051, 2054, 2058, 2061, 2065, 2068, 2071, 2075, 2078, 2082, 2085, 2088, 2092, 2095, 2099, 2102, 2106, 2109, 2112, 2116, 2119, 2123, 2126, 2129, 2133, 2136, 2140, 2143, 2146, 2150, 2153, 2157, 2160, 2164, 2167, 2170, 2174, 2177, 2181, 2184, 2187, 2191, 2194, 2198, 2201, 2205, 2208, 2211, 2215, 2218, 2222, 2225, 2228, 2232, 2235, 2239, 2242, 2245, 2249, 2252, 2256, 2259, 2263, 2266, 2269, 2273, 2276, 2280, 2283, 2286, 2290, 2293, 2297, 2300, 2303, 2304, 2307, 2310, 2314, 2317, 2321, 2324, 2327, 2331, 2334, 2338, 2341, 2344, 2348, 2351, 2355, 2358, 2362, 2365, 2368, 2372, 2375, 2379, 2382, 2385, 2389, 2392, 2396, 2399, 2402, 2406, 2409, 2413, 2416, 2420, 2423, 2426, 2430, 2433, 2437, 2440, 2443, 2447, 2450, 2454, 2457, 2461, 2464, 2467, 2471, 2474, 2478, 2481, 2484, 2488, 2491, 2495, 2498, 2501, 2505, 2508, 2512, 2515, 2519, 2522, 2525, 2529, 2532, 2536, 2539, 2542, 2546, 2549, 2553, 2556, 2559, 2560, 2563, 2566, 2570, 2573, 2577, 2580, 2583, 2587, 2590, 2594, 2597, 2600, 2604, 2607, 2611, 2614, 2618, 2621, 2624, 2628, 2631, 2635, 2638, 2641, 2645, 2648, 2652, 2655, 2658, 2662, 2665, 2669, 2672, 2676, 2679, 2682, 2686, 2689, 2693, 2696, 2699, 2703, 2706, 2710, 2713, 2717, 2720, 2723, 2727, 2730, 2734, 2737, 2740, 2744, 2747, 2751, 2754, 2757, 2761, 2764, 2768, 2771, 2775, 2778, 2781, 2785, 2788, 2792, 2795, 2798, 2802, 2805, 2809, 2812, 2815, 2816, 2819, 2822, 2826, 2829, 2833, 2836, 2839, 2843, 2846, 2850, 2853, 2856, 2860, 2863, 2867, 2870, 2874, 2877, 2880, 2884, 2887, 2891, 2894, 2897, 2901, 2904, 2908, 2911, 2914, 2918, 2921, 2925, 2928, 2932, 2935, 2938, 2942, 2945, 2949, 2952, 2955, 2959, 2962, 2966, 2969, 2973, 2976, 2979, 2983, 2986, 2990, 2993, 2996, 3000, 3003, 3007, 3010, 3013, 3017, 3020, 3024, 3027, 3031, 3034, 3037, 3041, 3044, 3048, 3051, 3054, 3058, 3061, 3065, 3068, 3071, 3072, 3075, 3078, 3082, 3085, 3089, 3092, 3095, 3099, 3102, 3106, 3109, 3112, 3116, 3119, 3123, 3126, 3130, 3133, 3136, 3140, 3143, 3147, 3150, 3153, 3157, 3160, 3164, 3167, 3170, 3174, 3177, 3181, 3184, 3188, 3191, 3194, 3198, 3201, 3205, 3208, 3211, 3215, 3218, 3222, 3225, 3229, 3232, 3235, 3239, 3242, 3246, 3249, 3252, 3256, 3259, 3263, 3266, 3269, 3273, 3276, 3280, 3283, 3287, 3290, 3293, 3297, 3300, 3304, 3307, 3310, 3314, 3317, 3321, 3324, 3327, 3328, 3331, 3334, 3338, 3341, 3345, 3348, 3351, 3355, 3358, 3362, 3365, 3368, 3372, 3375, 3379, 3382, 3386, 3389, 3392, 3396, 3399, 3403, 3406, 3409, 3413, 3416, 3420, 3423, 3426, 3430, 3433, 3437, 3440, 3444, 3447, 3450, 3454, 3457, 3461, 3464, 3467, 3471, 3474, 3478, 3481, 3485, 3488, 3491, 3495, 3498, 3502, 3505, 3508, 3512, 3515, 3519, 3522, 3525, 3529, 3532, 3536, 3539, 3543, 3546, 3549, 3553, 3556, 3560, 3563, 3566, 3570, 3573, 3577, 3580, 3583, 3584, 3587, 3590, 3594, 3597, 3601, 3604, 3607, 3611, 3614, 3618, 3621, 3624, 3628, 3631, 3635, 3638, 3642, 3645, 3648, 3652, 3655, 3659, 3662, 3665, 3669, 3672, 3676, 3679, 3682, 3686, 3689, 3693, 3696, 3700, 3703, 3706, 3710, 3713, 3717, 3720, 3723, 3727, 3730, 3734, 3737, 3741, 3744, 3747, 3751, 3754, 3758, 3761, 3764, 3768, 3771, 3775, 3778, 3781, 3785, 3788, 3792, 3795, 3799, 3802, 3805, 3809, 3812, 3816, 3819, 3822, 3826, 3829, 3833, 3836, 3840, 3843, 3846, 3850, 3853, 3857, 3860, 3863, 3867, 3870, 3874, 3877, 3880, 3884, 3887, 3891, 3894, 3898, 3901, 3904, 3908, 3911, 3915, 3918, 3921, 3925, 3928, 3932, 3935, 3938, 3942, 3945, 3949, 3952, 3956, 3959, 3962, 3966, 3969, 3973, 3976, 3979, 3983, 3986, 3990, 3993, 3997, 4000, 4003, 4007, 4010, 4014, 4017, 4020, 4024, 4027, 4031, 4034, 4037, 4041, 4044, 4048, 4051, 4055, 4058, 4061, 4065, 4068, 4072, 4075, 4078, 4082, 4085, 4089, 4092, 4095, 4096, 4102, 4109, 4116, 4123, 4130, 4136, 4143, 4150, 4157, 4164, 4171, 4177, 4184, 4191, 4198, 4205, 4212, 4218, 4225, 4232, 4239, 4246, 4253, 4259, 4266, 4273, 4280, 4287, 4293, 4300, 4307, 4314, 4321, 4328, 4334, 4341, 4348, 4355, 4362, 4369, 4375, 4382, 4389, 4396, 4403, 4410, 4416, 4423, 4430, 4437, 4444, 4450, 4457, 4464, 4471, 4478, 4485, 4491, 4498, 4505, 4512, 4519, 4526, 4532, 4539, 4546, 4553, 4560, 4567, 4573, 4580, 4587, 4594, 4601, 4607, 4608, 4614, 4621, 4628, 4635, 4642, 4648, 4655, 4662, 4669, 4676, 4683, 4689, 4696, 4703, 4710, 4717, 4724, 4730, 4737, 4744, 4751, 4758, 4765, 4771, 4778, 4785, 4792, 4799, 4805, 4812, 4819, 4826, 4833, 4840, 4846, 4853, 4860, 4867, 4874, 4881, 4887, 4894, 4901, 4908, 4915, 4922, 4928, 4935, 4942, 4949, 4956, 4962, 4969, 4976, 4983, 4990, 4997, 5003, 5010, 5017, 5024, 5031, 5038, 5044, 5051, 5058, 5065, 5072, 5079, 5085, 5092, 5099, 5106, 5113, 5119, 5120, 5126, 5133, 5140, 5147, 5154, 5160, 5167, 5174, 5181, 5188, 5195, 5201, 5208, 5215, 5222, 5229, 5236, 5242, 5249, 5256, 5263, 5270, 5277, 5283, 5290, 5297, 5304, 5311, 5317, 5324, 5331, 5338, 5345, 5352, 5358, 5365, 5372, 5379, 5386, 5393, 5399, 5406, 5413, 5420, 5427, 5434, 5440, 5447, 5454, 5461, 5468, 5474, 5481, 5488, 5495, 5502, 5509, 5515, 5522, 5529, 5536, 5543, 5550, 5556, 5563, 5570, 5577, 5584, 5591, 5597, 5604, 5611, 5618, 5625, 5631, 5632, 5638, 5645, 5652, 5659, 5666, 5672, 5679, 5686, 5693, 5700, 5707, 5713, 5720, 5727, 5734, 5741, 5748, 5754, 5761, 5768, 5775, 5782, 5789, 5795, 5802, 5809, 5816, 5823, 5829, 5836, 5843, 5850, 5857, 5864, 5870, 5877, 5884, 5891, 5898, 5905, 5911, 5918, 5925, 5932, 5939, 5946, 5952, 5959, 5966, 5973, 5980, 5986, 5993, 6000, 6007, 6014, 6021, 6027, 6034, 6041, 6048, 6055, 6062, 6068, 6075, 6082, 6089, 6096, 6103, 6109, 6116, 6123, 6130, 6137, 6143, 6144, 6150, 6157, 6164, 6171, 6178, 6184, 6191, 6198, 6205, 6212, 6219, 6225, 6232, 6239, 6246, 6253, 6260, 6266, 6273, 6280, 6287, 6294, 6301, 6307, 6314, 6321, 6328, 6335, 6341, 6348, 6355, 6362, 6369, 6376, 6382, 6389, 6396, 6403, 6410, 6417, 6423, 6430, 6437, 6444, 6451, 6458, 6464, 6471, 6478, 6485, 6492, 6498, 6505, 6512, 6519, 6526, 6533, 6539, 6546, 6553, 6560, 6567, 6574, 6580, 6587, 6594, 6601, 6608, 6615, 6621, 6628, 6635, 6642, 6649, 6655, 6656, 6662, 6669, 6676, 6683, 6690, 6696, 6703, 6710, 6717, 6724, 6731, 6737, 6744, 6751, 6758, 6765, 6772, 6778, 6785, 6792, 6799, 6806, 6813, 6819, 6826, 6833, 6840, 6847, 6853, 6860, 6867, 6874, 6881, 6888, 6894, 6901, 6908, 6915, 6922, 6929, 6935, 6942, 6949, 6956, 6963, 6970, 6976, 6983, 6990, 6997, 7004, 7010, 7017, 7024, 7031, 7038, 7045, 7051, 7058, 7065, 7072, 7079, 7086, 7092, 7099, 7106, 7113, 7120, 7127, 7133, 7140, 7147, 7154, 7161, 7167, 7168, 7174, 7181, 7188, 7195, 7202, 7208, 7215, 7222, 7229, 7236, 7243, 7249, 7256, 7263, 7270, 7277, 7284, 7290, 7297, 7304, 7311, 7318, 7325, 7331, 7338, 7345, 7352, 7359, 7365, 7372, 7379, 7386, 7393, 7400, 7406, 7413, 7420, 7427, 7434, 7441, 7447, 7454, 7461, 7468, 7475, 7482, 7488, 7495, 7502, 7509, 7516, 7522, 7529, 7536, 7543, 7550, 7557, 7563, 7570, 7577, 7584, 7591, 7598, 7604, 7611, 7618, 7625, 7632, 7639, 7645, 7652, 7659, 7666, 7673, 7680, 7686, 7693, 7700, 7707, 7714, 7720, 7727, 7734, 7741, 7748, 7755, 7761, 7768, 7775, 7782, 7789, 7796, 7802, 7809, 7816, 7823, 7830, 7837, 7843, 7850, 7857, 7864, 7871, 7877, 7884, 7891, 7898, 7905, 7912, 7918, 7925, 7932, 7939, 7946, 7953, 7959, 7966, 7973, 7980, 7987, 7994, 8000, 8007, 8014, 8021, 8028, 8034, 8041, 8048, 8055, 8062, 8069, 8075, 8082, 8089, 8096, 8103, 8110, 8116, 8123, 8130, 8137, 8144, 8151, 8157, 8164, 8171, 8178, 8185, 8191, 8192, 8205, 8219, 8232, 8246, 8260, 8273, 8287, 8301, 8314, 8328, 8342, 8355, 8369, 8383, 8396, 8410, 8424, 8437, 8451, 8465, 8478, 8492, 8506, 8519, 8533, 8546, 8560, 8574, 8587, 8601, 8615, 8628, 8642, 8656, 8669, 8683, 8697, 8710, 8724, 8738, 8751, 8765, 8779, 8792, 8806, 8820, 8833, 8847, 8861, 8874, 8888, 8901, 8915, 8929, 8942, 8956, 8970, 8983, 8997, 9011, 9024, 9038, 9052, 9065, 9079, 9093, 9106, 9120, 9134, 9147, 9161, 9175, 9188, 9202, 9215, 9216, 9229, 9243, 9256, 9270, 9284, 9297, 9311, 9325, 9338, 9352, 9366, 9379, 9393, 9407, 9420, 9434, 9448, 9461, 9475, 9489, 9502, 9516, 9530, 9543, 9557, 9570, 9584, 9598, 9611, 9625, 9639, 9652, 9666, 9680, 9693, 9707, 9721, 9734, 9748, 9762, 9775, 9789, 9803, 9816, 9830, 9844, 9857, 9871, 9885, 9898, 9912, 9925, 9939, 9953, 9966, 9980, 9994, 10007, 10021, 10035, 10048, 10062, 10076, 10089, 10103, 10117, 10130, 10144, 10158, 10171, 10185, 10199, 10212, 10226, 10239, 10240, 10253, 10267, 10280, 10294, 10308, 10321, 10335, 10349, 10362, 10376, 10390, 10403, 10417, 10431, 10444, 10458, 10472, 10485, 10499, 10513, 10526, 10540, 10554, 10567, 10581, 10594, 10608, 10622, 10635, 10649, 10663, 10676, 10690, 10704, 10717, 10731, 10745, 10758, 10772, 10786, 10799, 10813, 10827, 10840, 10854, 10868, 10881, 10895, 10909, 10922, 10936, 10949, 10963, 10977, 10990, 11004, 11018, 11031, 11045, 11059, 11072, 11086, 11100, 11113, 11127, 11141, 11154, 11168, 11182, 11195, 11209, 11223, 11236, 11250, 11263, 11264, 11277, 11291, 11304, 11318, 11332, 11345, 11359, 11373, 11386, 11400, 11414, 11427, 11441, 11455, 11468, 11482, 11496, 11509, 11523, 11537, 11550, 11564, 11578, 11591, 11605, 11618, 11632, 11646, 11659, 11673, 11687, 11700, 11714, 11728, 11741, 11755, 11769, 11782, 11796, 11810, 11823, 11837, 11851, 11864, 11878, 11892, 11905, 11919, 11933, 11946, 11960, 11973, 11987, 12001, 12014, 12028, 12042, 12055, 12069, 12083, 12096, 12110, 12124, 12137, 12151, 12165, 12178, 12192, 12206, 12219, 12233, 12247, 12260, 12274, 12287, 12288, 12301, 12315, 12328, 12342, 12356, 12369, 12383, 12397, 12410, 12424, 12438, 12451, 12465, 12479, 12492, 12506, 12520, 12533, 12547, 12561, 12574, 12588, 12602, 12615, 12629, 12642, 12656, 12670, 12683, 12697, 12711, 12724, 12738, 12752, 12765, 12779, 12793, 12806, 12820, 12834, 12847, 12861, 12875, 12888, 12902, 12916, 12929, 12943, 12957, 12970, 12984, 12997, 13011, 13025, 13038, 13052, 13066, 13079, 13093, 13107, 13120, 13134, 13148, 13161, 13175, 13189, 13202, 13216, 13230, 13243, 13257, 13271, 13284, 13298, 13311, 13312, 13325, 13339, 13352, 13366, 13380, 13393, 13407, 13421, 13434, 13448, 13462, 13475, 13489, 13503, 13516, 13530, 13544, 13557, 13571, 13585, 13598, 13612, 13626, 13639, 13653, 13666, 13680, 13694, 13707, 13721, 13735, 13748, 13762, 13776, 13789, 13803, 13817, 13830, 13844, 13858, 13871, 13885, 13899, 13912, 13926, 13940, 13953, 13967, 13981, 13994, 14008, 14021, 14035, 14049, 14062, 14076, 14090, 14103, 14117, 14131, 14144, 14158, 14172, 14185, 14199, 14213, 14226, 14240, 14254, 14267, 14281, 14295, 14308, 14322, 14335, 14336, 14349, 14363, 14376, 14390, 14404, 14417, 14431, 14445, 14458, 14472, 14486, 14499, 14513, 14527, 14540, 14554, 14568, 14581, 14595, 14609, 14622, 14636, 14650, 14663, 14677, 14690, 14704, 14718, 14731, 14745, 14759, 14772, 14786, 14800, 14813, 14827, 14841, 14854, 14868, 14882, 14895, 14909, 14923, 14936, 14950, 14964, 14977, 14991, 15005, 15018, 15032, 15045, 15059, 15073, 15086, 15100, 15114, 15127, 15141, 15155, 15168, 15182, 15196, 15209, 15223, 15237, 15250, 15264, 15278, 15291, 15305, 15319, 15332, 15346, 15360, 15373, 15387, 15400, 15414, 15428, 15441, 15455, 15469, 15482, 15496, 15510, 15523, 15537, 15551, 15564, 15578, 15592, 15605, 15619, 15633, 15646, 15660, 15674, 15687, 15701, 15714, 15728, 15742, 15755, 15769, 15783, 15796, 15810, 15824, 15837, 15851, 15865, 15878, 15892, 15906, 15919, 15933, 15947, 15960, 15974, 15988, 16001, 16015, 16029, 16042, 16056, 16069, 16083, 16097, 16110, 16124, 16138, 16151, 16165, 16179, 16192, 16206, 16220, 16233, 16247, 16261, 16274, 16288, 16302, 16315, 16329, 16343, 16356, 16370, 16383, 16384, 16411, 16438, 16465, 16493, 16520, 16547, 16575, 16602, 16629, 16657, 16684, 16711, 16738, 16766, 16793, 16820, 16848, 16875, 16902, 16930, 16957, 16984, 17012, 17039, 17066, 17093, 17121, 17148, 17175, 17203, 17230, 17257, 17285, 17312, 17339, 17367, 17394, 17421, 17448, 17476, 17503, 17530, 17558, 17585, 17612, 17640, 17667, 17694, 17722, 17749, 17776, 17803, 17831, 17858, 17885, 17913, 17940, 17967, 17995, 18022, 18049, 18077, 18104, 18131, 18158, 18186, 18213, 18240, 18268, 18295, 18322, 18350, 18377, 18404, 18431, 18432, 18459, 18486, 18513, 18541, 18568, 18595, 18623, 18650, 18677, 18705, 18732, 18759, 18786, 18814, 18841, 18868, 18896, 18923, 18950, 18978, 19005, 19032, 19060, 19087, 19114, 19141, 19169, 19196, 19223, 19251, 19278, 19305, 19333, 19360, 19387, 19415, 19442, 19469, 19496, 19524, 19551, 19578, 19606, 19633, 19660, 19688, 19715, 19742, 19770, 19797, 19824, 19851, 19879, 19906, 19933, 19961, 19988, 20015, 20043, 20070, 20097, 20125, 20152, 20179, 20206, 20234, 20261, 20288, 20316, 20343, 20370, 20398, 20425, 20452, 20479, 20480, 20507, 20534, 20561, 20589, 20616, 20643, 20671, 20698, 20725, 20753, 20780, 20807, 20834, 20862, 20889, 20916, 20944, 20971, 20998, 21026, 21053, 21080, 21108, 21135, 21162, 21189, 21217, 21244, 21271, 21299, 21326, 21353, 21381, 21408, 21435, 21463, 21490, 21517, 21544, 21572, 21599, 21626, 21654, 21681, 21708, 21736, 21763, 21790, 21818, 21845, 21872, 21899, 21927, 21954, 21981, 22009, 22036, 22063, 22091, 22118, 22145, 22173, 22200, 22227, 22254, 22282, 22309, 22336, 22364, 22391, 22418, 22446, 22473, 22500, 22527, 22528, 22555, 22582, 22609, 22637, 22664, 22691, 22719, 22746, 22773, 22801, 22828, 22855, 22882, 22910, 22937, 22964, 22992, 23019, 23046, 23074, 23101, 23128, 23156, 23183, 23210, 23237, 23265, 23292, 23319, 23347, 23374, 23401, 23429, 23456, 23483, 23511, 23538, 23565, 23592, 23620, 23647, 23674, 23702, 23729, 23756, 23784, 23811, 23838, 23866, 23893, 23920, 23947, 23975, 24002, 24029, 24057, 24084, 24111, 24139, 24166, 24193, 24221, 24248, 24275, 24302, 24330, 24357, 24384, 24412, 24439, 24466, 24494, 24521, 24548, 24575, 24576, 24603, 24630, 24657, 24685, 24712, 24739, 24767, 24794, 24821, 24849, 24876, 24903, 24930, 24958, 24985, 25012, 25040, 25067, 25094, 25122, 25149, 25176, 25204, 25231, 25258, 25285, 25313, 25340, 25367, 25395, 25422, 25449, 25477, 25504, 25531, 25559, 25586, 25613, 25640, 25668, 25695, 25722, 25750, 25777, 25804, 25832, 25859, 25886, 25914, 25941, 25968, 25995, 26023, 26050, 26077, 26105, 26132, 26159, 26187, 26214, 26241, 26269, 26296, 26323, 26350, 26378, 26405, 26432, 26460, 26487, 26514, 26542, 26569, 26596, 26623, 26624, 26651, 26678, 26705, 26733, 26760, 26787, 26815, 26842, 26869, 26897, 26924, 26951, 26978, 27006, 27033, 27060, 27088, 27115, 27142, 27170, 27197, 27224, 27252, 27279, 27306, 27333, 27361, 27388, 27415, 27443, 27470, 27497, 27525, 27552, 27579, 27607, 27634, 27661, 27688, 27716, 27743, 27770, 27798, 27825, 27852, 27880, 27907, 27934, 27962, 27989, 28016, 28043, 28071, 28098, 28125, 28153, 28180, 28207, 28235, 28262, 28289, 28317, 28344, 28371, 28398, 28426, 28453, 28480, 28508, 28535, 28562, 28590, 28617, 28644, 28671, 28672, 28699, 28726, 28753, 28781, 28808, 28835, 28863, 28890, 28917, 28945, 28972, 28999, 29026, 29054, 29081, 29108, 29136, 29163, 29190, 29218, 29245, 29272, 29300, 29327, 29354, 29381, 29409, 29436, 29463, 29491, 29518, 29545, 29573, 29600, 29627, 29655, 29682, 29709, 29736, 29764, 29791, 29818, 29846, 29873, 29900, 29928, 29955, 29982, 30010, 30037, 30064, 30091, 30119, 30146, 30173, 30201, 30228, 30255, 30283, 30310, 30337, 30365, 30392, 30419, 30446, 30474, 30501, 30528, 30556, 30583, 30610, 30638, 30665, 30692, 30720, 30747, 30774, 30801, 30829, 30856, 30883, 30911, 30938, 30965, 30993, 31020, 31047, 31074, 31102, 31129, 31156, 31184, 31211, 31238, 31266, 31293, 31320, 31348, 31375, 31402, 31429, 31457, 31484, 31511, 31539, 31566, 31593, 31621, 31648, 31675, 31703, 31730, 31757, 31784, 31812, 31839, 31866, 31894, 31921, 31948, 31976, 32003, 32030, 32058, 32085, 32112, 32139, 32167, 32194, 32221, 32249, 32276, 32303, 32331, 32358, 32385, 32413, 32440, 32467, 32494, 32522, 32549, 32576, 32604, 32631, 32658, 32686, 32713, 32740, 32767, 32768, 32822, 32877, 32931, 32986, 33041, 33095, 33150, 33204, 33259, 33314, 33368, 33423, 33477, 33532, 33587, 33641, 33696, 33751, 33805, 33860, 33914, 33969, 34024, 34078, 34133, 34187, 34242, 34297, 34351, 34406, 34461, 34515, 34570, 34624, 34679, 34734, 34788, 34843, 34897, 34952, 35007, 35061, 35116, 35170, 35225, 35280, 35334, 35389, 35444, 35498, 35553, 35607, 35662, 35717, 35771, 35826, 35880, 35935, 35990, 36044, 36099, 36154, 36208, 36263, 36317, 36372, 36427, 36481, 36536, 36590, 36645, 36700, 36754, 36809, 36863, 36864, 36918, 36973, 37027, 37082, 37137, 37191, 37246, 37300, 37355, 37410, 37464, 37519, 37573, 37628, 37683, 37737, 37792, 37847, 37901, 37956, 38010, 38065, 38120, 38174, 38229, 38283, 38338, 38393, 38447, 38502, 38557, 38611, 38666, 38720, 38775, 38830, 38884, 38939, 38993, 39048, 39103, 39157, 39212, 39266, 39321, 39376, 39430, 39485, 39540, 39594, 39649, 39703, 39758, 39813, 39867, 39922, 39976, 40031, 40086, 40140, 40195, 40250, 40304, 40359, 40413, 40468, 40523, 40577, 40632, 40686, 40741, 40796, 40850, 40905, 40959, 40960, 41014, 41069, 41123, 41178, 41233, 41287, 41342, 41396, 41451, 41506, 41560, 41615, 41669, 41724, 41779, 41833, 41888, 41943, 41997, 42052, 42106, 42161, 42216, 42270, 42325, 42379, 42434, 42489, 42543, 42598, 42653, 42707, 42762, 42816, 42871, 42926, 42980, 43035, 43089, 43144, 43199, 43253, 43308, 43362, 43417, 43472, 43526, 43581, 43636, 43690, 43745, 43799, 43854, 43909, 43963, 44018, 44072, 44127, 44182, 44236, 44291, 44346, 44400, 44455, 44509, 44564, 44619, 44673, 44728, 44782, 44837, 44892, 44946, 45001, 45055, 45056, 45110, 45165, 45219, 45274, 45329, 45383, 45438, 45492, 45547, 45602, 45656, 45711, 45765, 45820, 45875, 45929, 45984, 46039, 46093, 46148, 46202, 46257, 46312, 46366, 46421, 46475, 46530, 46585, 46639, 46694, 46749, 46803, 46858, 46912, 46967, 47022, 47076, 47131, 47185, 47240, 47295, 47349, 47404, 47458, 47513, 47568, 47622, 47677, 47732, 47786, 47841, 47895, 47950, 48005, 48059, 48114, 48168, 48223, 48278, 48332, 48387, 48442, 48496, 48551, 48605, 48660, 48715, 48769, 48824, 48878, 48933, 48988, 49042, 49097, 49151, 49152, 49206, 49261, 49315, 49370, 49425, 49479, 49534, 49588, 49643, 49698, 49752, 49807, 49861, 49916, 49971, 50025, 50080, 50135, 50189, 50244, 50298, 50353, 50408, 50462, 50517, 50571, 50626, 50681, 50735, 50790, 50845, 50899, 50954, 51008, 51063, 51118, 51172, 51227, 51281, 51336, 51391, 51445, 51500, 51554, 51609, 51664, 51718, 51773, 51828, 51882, 51937, 51991, 52046, 52101, 52155, 52210, 52264, 52319, 52374, 52428, 52483, 52538, 52592, 52647, 52701, 52756, 52811, 52865, 52920, 52974, 53029, 53084, 53138, 53193, 53247, 53248, 53302, 53357, 53411, 53466, 53521, 53575, 53630, 53684, 53739, 53794, 53848, 53903, 53957, 54012, 54067, 54121, 54176, 54231, 54285, 54340, 54394, 54449, 54504, 54558, 54613, 54667, 54722, 54777, 54831, 54886, 54941, 54995, 55050, 55104, 55159, 55214, 55268, 55323, 55377, 55432, 55487, 55541, 55596, 55650, 55705, 55760, 55814, 55869, 55924, 55978, 56033, 56087, 56142, 56197, 56251, 56306, 56360, 56415, 56470, 56524, 56579, 56634, 56688, 56743, 56797, 56852, 56907, 56961, 57016, 57070, 57125, 57180, 57234, 57289, 57343, 57344, 57398, 57453, 57507, 57562, 57617, 57671, 57726, 57780, 57835, 57890, 57944, 57999, 58053, 58108, 58163, 58217, 58272, 58327, 58381, 58436, 58490, 58545, 58600, 58654, 58709, 58763, 58818, 58873, 58927, 58982, 59037, 59091, 59146, 59200, 59255, 59310, 59364, 59419, 59473, 59528, 59583, 59637, 59692, 59746, 59801, 59856, 59910, 59965, 60020, 60074, 60129, 60183, 60238, 60293, 60347, 60402, 60456, 60511, 60566, 60620, 60675, 60730, 60784, 60839, 60893, 60948, 61003, 61057, 61112, 61166, 61221, 61276, 61330, 61385, 61440, 61494, 61549, 61603, 61658, 61713, 61767, 61822, 61876, 61931, 61986, 62040, 62095, 62149, 62204, 62259, 62313, 62368, 62423, 62477, 62532, 62586, 62641, 62696, 62750, 62805, 62859, 62914, 62969, 63023, 63078, 63133, 63187, 63242, 63296, 63351, 63406, 63460, 63515, 63569, 63624, 63679, 63733, 63788, 63842, 63897, 63952, 64006, 64061, 64116, 64170, 64225, 64279, 64334, 64389, 64443, 64498, 64552, 64607, 64662, 64716, 64771, 64826, 64880, 64935, 64989, 65044, 65099, 65153, 65208, 65262, 65317, 65372, 65426, 65481, 65535, 65536, 65645, 65754, 65863, 65972, 66082, 66191, 66300, 66409, 66519, 66628, 66737, 66846, 66955, 67065, 67174, 67283, 67392, 67502, 67611, 67720, 67829, 67938, 68048, 68157, 68266, 68375, 68485, 68594, 68703, 68812, 68922, 69031, 69140, 69249, 69358, 69468, 69577, 69686, 69795, 69905, 70014, 70123, 70232, 70341, 70451, 70560, 70669, 70778, 70888, 70997, 71106, 71215, 71325, 71434, 71543, 71652, 71761, 71871, 71980, 72089, 72198, 72308, 72417, 72526, 72635, 72744, 72854, 72963, 73072, 73181, 73291, 73400, 73509, 73618, 73727, 73728, 73837, 73946, 74055, 74164, 74274, 74383, 74492, 74601, 74711, 74820, 74929, 75038, 75147, 75257, 75366, 75475, 75584, 75694, 75803, 75912, 76021, 76130, 76240, 76349, 76458, 76567, 76677, 76786, 76895, 77004, 77114, 77223, 77332, 77441, 77550, 77660, 77769, 77878, 77987, 78097, 78206, 78315, 78424, 78533, 78643, 78752, 78861, 78970, 79080, 79189, 79298, 79407, 79517, 79626, 79735, 79844, 79953, 80063, 80172, 80281, 80390, 80500, 80609, 80718, 80827, 80936, 81046, 81155, 81264, 81373, 81483, 81592, 81701, 81810, 81919, 81920, 82029, 82138, 82247, 82356, 82466, 82575, 82684, 82793, 82903, 83012, 83121, 83230, 83339, 83449, 83558, 83667, 83776, 83886, 83995, 84104, 84213, 84322, 84432, 84541, 84650, 84759, 84869, 84978, 85087, 85196, 85306, 85415, 85524, 85633, 85742, 85852, 85961, 86070, 86179, 86289, 86398, 86507, 86616, 86725, 86835, 86944, 87053, 87162, 87272, 87381, 87490, 87599, 87709, 87818, 87927, 88036, 88145, 88255, 88364, 88473, 88582, 88692, 88801, 88910, 89019, 89128, 89238, 89347, 89456, 89565, 89675, 89784, 89893, 90002, 90111, 90112, 90221, 90330, 90439, 90548, 90658, 90767, 90876, 90985, 91095, 91204, 91313, 91422, 91531, 91641, 91750, 91859, 91968, 92078, 92187, 92296, 92405, 92514, 92624, 92733, 92842, 92951, 93061, 93170, 93279, 93388, 93498, 93607, 93716, 93825, 93934, 94044, 94153, 94262, 94371, 94481, 94590, 94699, 94808, 94917, 95027, 95136, 95245, 95354, 95464, 95573, 95682, 95791, 95901, 96010, 96119, 96228, 96337, 96447, 96556, 96665, 96774, 96884, 96993, 97102, 97211, 97320, 97430, 97539, 97648, 97757, 97867, 97976, 98085, 98194, 98303, 98304, 98413, 98522, 98631, 98740, 98850, 98959, 99068, 99177, 99287, 99396, 99505, 99614, 99723, 99833, 99942, 100051, 100160, 100270, 100379, 100488, 100597, 100706, 100816, 100925, 101034, 101143, 101253, 101362, 101471, 101580, 101690, 101799, 101908, 102017, 102126, 102236, 102345, 102454, 102563, 102673, 102782, 102891, 103000, 103109, 103219, 103328, 103437, 103546, 103656, 103765, 103874, 103983, 104093, 104202, 104311, 104420, 104529, 104639, 104748, 104857, 104966, 105076, 105185, 105294, 105403, 105512, 105622, 105731, 105840, 105949, 106059, 106168, 106277, 106386, 106495, 106496, 106605, 106714, 106823, 106932, 107042, 107151, 107260, 107369, 107479, 107588, 107697, 107806, 107915, 108025, 108134, 108243, 108352, 108462, 108571, 108680, 108789, 108898, 109008, 109117, 109226, 109335, 109445, 109554, 109663, 109772, 109882, 109991, 110100, 110209, 110318, 110428, 110537, 110646, 110755, 110865, 110974, 111083, 111192, 111301, 111411, 111520, 111629, 111738, 111848, 111957, 112066, 112175, 112285, 112394, 112503, 112612, 112721, 112831, 112940, 113049, 113158, 113268, 113377, 113486, 113595, 113704, 113814, 113923, 114032, 114141, 114251, 114360, 114469, 114578, 114687, 114688, 114797, 114906, 115015, 115124, 115234, 115343, 115452, 115561, 115671, 115780, 115889, 115998, 116107, 116217, 116326, 116435, 116544, 116654, 116763, 116872, 116981, 117090, 117200, 117309, 117418, 117527, 117637, 117746, 117855, 117964, 118074, 118183, 118292, 118401, 118510, 118620, 118729, 118838, 118947, 119057, 119166, 119275, 119384, 119493, 119603, 119712, 119821, 119930, 120040, 120149, 120258, 120367, 120477, 120586, 120695, 120804, 120913, 121023, 121132, 121241, 121350, 121460, 121569, 121678, 121787, 121896, 122006, 122115, 122224, 122333, 122443, 122552, 122661, 122770, 122880, 122989, 123098, 123207, 123316, 123426, 123535, 123644, 123753, 123863, 123972, 124081, 124190, 124299, 124409, 124518, 124627, 124736, 124846, 124955, 125064, 125173, 125282, 125392, 125501, 125610, 125719, 125829, 125938, 126047, 126156, 126266, 126375, 126484, 126593, 126702, 126812, 126921, 127030, 127139, 127249, 127358, 127467, 127576, 127685, 127795, 127904, 128013, 128122, 128232, 128341, 128450, 128559, 128669, 128778, 128887, 128996, 129105, 129215, 129324, 129433, 129542, 129652, 129761, 129870, 129979, 130088, 130198, 130307, 130416, 130525, 130635, 130744, 130853, 130962, 131071, 131072, 131290, 131508, 131727, 131945, 132164, 132382, 132601, 132819, 133038, 133256, 133474, 133475, 133693, 133911, 134130, 134348, 134567, 134785, 135004, 135222, 135441, 135659, 135877, 136096, 136314, 136533, 136751, 136970, 137188, 137407, 137625, 137844, 138062, 138280, 138499, 138717, 138936, 139154, 139373, 139591, 139810, 140028, 140247, 140465, 140683, 140902, 141120, 141339, 141557, 141776, 141994, 142213, 142431, 142650, 142868, 143086, 143305, 143523, 143742, 143960, 144179, 144397, 144616, 144834, 145053, 145271, 145489, 145708, 145926, 146145, 146363, 146582, 146800, 147019, 147237, 147455, 147456, 147674, 147892, 148111, 148329, 148548, 148766, 148985, 149203, 149422, 149640, 149858, 149859, 150077, 150295, 150514, 150732, 150951, 151169, 151388, 151606, 151825, 152043, 152261, 152480, 152698, 152917, 153135, 153354, 153572, 153791, 154009, 154228, 154446, 154664, 154883, 155101, 155320, 155538, 155757, 155975, 156194, 156412, 156631, 156849, 157067, 157286, 157504, 157723, 157941, 158160, 158378, 158597, 158815, 159034, 159252, 159470, 159689, 159907, 160126, 160344, 160563, 160781, 161000, 161218, 161437, 161655, 161873, 162092, 162310, 162529, 162747, 162966, 163184, 163403, 163621, 163839, 163840, 164058, 164276, 164495, 164713, 164932, 165150, 165369, 165587, 165806, 166024, 166242, 166243, 166461, 166679, 166898, 167116, 167335, 167553, 167772, 167990, 168209, 168427, 168645, 168864, 169082, 169301, 169519, 169738, 169956, 170175, 170393, 170612, 170830, 171048, 171267, 171485, 171704, 171922, 172141, 172359, 172578, 172796, 173015, 173233, 173451, 173670, 173888, 174107, 174325, 174544, 174762, 174981, 175199, 175418, 175636, 175854, 176073, 176291, 176510, 176728, 176947, 177165, 177384, 177602, 177821, 178039, 178257, 178476, 178694, 178913, 179131, 179350, 179568, 179787, 180005, 180223, 180224, 180442, 180660, 180879, 181097, 181316, 181534, 181753, 181971, 182190, 182408, 182626, 182627, 182845, 183063, 183282, 183500, 183719, 183937, 184156, 184374, 184593, 184811, 185029, 185248, 185466, 185685, 185903, 186122, 186340, 186559, 186777, 186996, 187214, 187432, 187651, 187869, 188088, 188306, 188525, 188743, 188962, 189180, 189399, 189617, 189835, 190054, 190272, 190491, 190709, 190928, 191146, 191365, 191583, 191802, 192020, 192238, 192457, 192675, 192894, 193112, 193331, 193549, 193768, 193986, 194205, 194423, 194641, 194860, 195078, 195297, 195515, 195734, 195952, 196171, 196389, 196607, 196608, 196826, 197044, 197263, 197481, 197700, 197918, 198137, 198355, 198574, 198792, 199010, 199011, 199229, 199447, 199666, 199884, 200103, 200321, 200540, 200758, 200977, 201195, 201413, 201632, 201850, 202069, 202287, 202506, 202724, 202943, 203161, 203380, 203598, 203816, 204035, 204253, 204472, 204690, 204909, 205127, 205346, 205564, 205783, 206001, 206219, 206438, 206656, 206875, 207093, 207312, 207530, 207749, 207967, 208186, 208404, 208622, 208841, 209059, 209278, 209496, 209715, 209933, 210152, 210370, 210589, 210807, 211025, 211244, 211462, 211681, 211899, 212118, 212336, 212555, 212773, 212991, 212992, 213210, 213428, 213647, 213865, 214084, 214302, 214521, 214739, 214958, 215176, 215394, 215395, 215613, 215831, 216050, 216268, 216487, 216705, 216924, 217142, 217361, 217579, 217797, 218016, 218234, 218453, 218671, 218890, 219108, 219327, 219545, 219764, 219982, 220200, 220419, 220637, 220856, 221074, 221293, 221511, 221730, 221948, 222167, 222385, 222603, 222822, 223040, 223259, 223477, 223696, 223914, 224133, 224351, 224570, 224788, 225006, 225225, 225443, 225662, 225880, 226099, 226317, 226536, 226754, 226973, 227191, 227409, 227628, 227846, 228065, 228283, 228502, 228720, 228939, 229157, 229375, 229376, 229594, 229812, 230031, 230249, 230468, 230686, 230905, 231123, 231342, 231560, 231778, 231779, 231997, 232215, 232434, 232652, 232871, 233089, 233308, 233526, 233745, 233963, 234181, 234400, 234618, 234837, 235055, 235274, 235492, 235711, 235929, 236148, 236366, 236584, 236803, 237021, 237240, 237458, 237677, 237895, 238114, 238332, 238551, 238769, 238987, 239206, 239424, 239643, 239861, 240080, 240298, 240517, 240735, 240954, 241172, 241390, 241609, 241827, 242046, 242264, 242483, 242701, 242920, 243138, 243357, 243575, 243793, 244012, 244230, 244449, 244667, 244886, 245104, 245323, 245541, 245760, 245978, 246196, 246415, 246633, 246852, 247070, 247289, 247507, 247726, 247944, 248162, 248163, 248381, 248599, 248818, 249036, 249255, 249473, 249692, 249910, 250129, 250347, 250565, 250784, 251002, 251221, 251439, 251658, 251876, 252095, 252313, 252532, 252750, 252968, 253187, 253405, 253624, 253842, 254061, 254279, 254498, 254716, 254935, 255153, 255371, 255590, 255808, 256027, 256245, 256464, 256682, 256901, 257119, 257338, 257556, 257774, 257993, 258211, 258430, 258648, 258867, 259085, 259304, 259522, 259741, 259959, 260177, 260396, 260614, 260833, 261051, 261270, 261488, 261707, 261925, 262143, 262144, 262580, 263017, 263454, 263891, 264328, 264765, 265202, 265639, 266076, 266513, 266949, 266950, 267386, 267823, 268260, 268697, 269134, 269571, 270008, 270445, 270882, 271319, 271755, 272192, 272629, 273066, 273503, 273940, 274377, 274814, 275251, 275688, 276125, 276561, 276998, 277435, 277872, 278309, 278746, 279183, 279620, 280057, 280494, 280930, 280931, 281367, 281804, 282241, 282678, 283115, 283552, 283989, 284426, 284863, 285300, 285736, 286173, 286610, 287047, 287484, 287921, 288358, 288795, 289232, 289669, 290106, 290542, 290979, 291416, 291853, 292290, 292727, 293164, 293601, 294038, 294475, 294911, 294912, 295348, 295785, 296222, 296659, 297096, 297533, 297970, 298407, 298844, 299281, 299717, 299718, 300154, 300591, 301028, 301465, 301902, 302339, 302776, 303213, 303650, 304087, 304523, 304960, 305397, 305834, 306271, 306708, 307145, 307582, 308019, 308456, 308893, 309329, 309766, 310203, 310640, 311077, 311514, 311951, 312388, 312825, 313262, 313698, 313699, 314135, 314572, 315009, 315446, 315883, 316320, 316757, 317194, 317631, 318068, 318504, 318941, 319378, 319815, 320252, 320689, 321126, 321563, 322000, 322437, 322874, 323310, 323747, 324184, 324621, 325058, 325495, 325932, 326369, 326806, 327243, 327679, 327680, 328116, 328553, 328990, 329427, 329864, 330301, 330738, 331175, 331612, 332049, 332485, 332486, 332922, 333359, 333796, 334233, 334670, 335107, 335544, 335981, 336418, 336855, 337291, 337728, 338165, 338602, 339039, 339476, 339913, 340350, 340787, 341224, 341661, 342097, 342534, 342971, 343408, 343845, 344282, 344719, 345156, 345593, 346030, 346466, 346467, 346903, 347340, 347777, 348214, 348651, 349088, 349525, 349962, 350399, 350836, 351272, 351709, 352146, 352583, 353020, 353457, 353894, 354331, 354768, 355205, 355642, 356078, 356515, 356952, 357389, 357826, 358263, 358700, 359137, 359574, 360011, 360447, 360448, 360884, 361321, 361758, 362195, 362632, 363069, 363506, 363943, 364380, 364817, 365253, 365254, 365690, 366127, 366564, 367001, 367438, 367875, 368312, 368749, 369186, 369623, 370059, 370496, 370933, 371370, 371807, 372244, 372681, 373118, 373555, 373992, 374429, 374865, 375302, 375739, 376176, 376613, 377050, 377487, 377924, 378361, 378798, 379234, 379235, 379671, 380108, 380545, 380982, 381419, 381856, 382293, 382730, 383167, 383604, 384040, 384477, 384914, 385351, 385788, 386225, 386662, 387099, 387536, 387973, 388410, 388846, 389283, 389720, 390157, 390594, 391031, 391468, 391905, 392342, 392779, 393215, 393216, 393652, 394089, 394526, 394963, 395400, 395837, 396274, 396711, 397148, 397585, 398021, 398022, 398458, 398895, 399332, 399769, 400206, 400643, 401080, 401517, 401954, 402391, 402827, 403264, 403701, 404138, 404575, 405012, 405449, 405886, 406323, 406760, 407197, 407633, 408070, 408507, 408944, 409381, 409818, 410255, 410692, 411129, 411566, 412002, 412003, 412439, 412876, 413313, 413750, 414187, 414624, 415061, 415498, 415935, 416372, 416808, 417245, 417682, 418119, 418556, 418993, 419430, 419867, 420304, 420741, 421178, 421614, 422051, 422488, 422925, 423362, 423799, 424236, 424673, 425110, 425547, 425983, 425984, 426420, 426857, 427294, 427731, 428168, 428605, 429042, 429479, 429916, 430353, 430789, 430790, 431226, 431663, 432100, 432537, 432974, 433411, 433848, 434285, 434722, 435159, 435595, 436032, 436469, 436906, 437343, 437780, 438217, 438654, 439091, 439528, 439965, 440401, 440838, 441275, 441712, 442149, 442586, 443023, 443460, 443897, 444334, 444770, 444771, 445207, 445644, 446081, 446518, 446955, 447392, 447829, 448266, 448703, 449140, 449576, 450013, 450450, 450887, 451324, 451761, 452198, 452635, 453072, 453509, 453946, 454382, 454819, 455256, 455693, 456130, 456567, 457004, 457441, 457878, 458315, 458751, 458752, 459188, 459625, 460062, 460499, 460936, 461373, 461810, 462247, 462684, 463121, 463557, 463558, 463994, 464431, 464868, 465305, 465742, 466179, 466616, 467053, 467490, 467927, 468363, 468800, 469237, 469674, 470111, 470548, 470985, 471422, 471859, 472296, 472733, 473169, 473606, 474043, 474480, 474917, 475354, 475791, 476228, 476665, 477102, 477538, 477539, 477975, 478412, 478849, 479286, 479723, 480160, 480597, 481034, 481471, 481908, 482344, 482781, 483218, 483655, 484092, 484529, 484966, 485403, 485840, 486277, 486714, 487150, 487587, 488024, 488461, 488898, 489335, 489772, 490209, 490646, 491083, 491520, 491956, 492393, 492830, 493267, 493704, 494141, 494578, 495015, 495452, 495889, 496325, 496326, 496762, 497199, 497636, 498073, 498510, 498947, 499384, 499821, 500258, 500695, 501131, 501568, 502005, 502442, 502879, 503316, 503753, 504190, 504627, 505064, 505501, 505937, 506374, 506811, 507248, 507685, 508122, 508559, 508996, 509433, 509870, 510306, 510307, 510743, 511180, 511617, 512054, 512491, 512928, 513365, 513802, 514239, 514676, 515112, 515549, 515986, 516423, 516860, 517297, 517734, 518171, 518608, 519045, 519482, 519918, 520355, 520792, 521229, 521666, 522103, 522540, 522977, 523414, 523851, 524287, 524288, 525161, 526035, 526909, 527783, 528657, 529530, 530404, 531278, 532152, 533026, 533899, 533900, 534773, 535647, 536521, 537395, 538269, 539142, 540016, 540890, 541764, 542638, 543511, 544385, 545259, 546133, 547007, 547880, 547881, 548754, 549628, 550502, 551376, 552250, 553123, 553997, 554871, 555745, 556619, 557492, 558366, 559240, 560114, 560988, 561861, 561862, 562735, 563609, 564483, 565357, 566231, 567104, 567978, 568852, 569726, 570600, 571473, 572347, 573221, 574095, 574969, 575842, 575843, 576716, 577590, 578464, 579338, 580212, 581085, 581959, 582833, 583707, 584581, 585454, 586328, 587202, 588076, 588950, 589823, 589824, 590697, 591571, 592445, 593319, 594193, 595066, 595940, 596814, 597688, 598562, 599435, 599436, 600309, 601183, 602057, 602931, 603805, 604678, 605552, 606426, 607300, 608174, 609047, 609921, 610795, 611669, 612543, 613416, 613417, 614290, 615164, 616038, 616912, 617786, 618659, 619533, 620407, 621281, 622155, 623028, 623902, 624776, 625650, 626524, 627397, 627398, 628271, 629145, 630019, 630893, 631767, 632640, 633514, 634388, 635262, 636136, 637009, 637883, 638757, 639631, 640505, 641378, 641379, 642252, 643126, 644000, 644874, 645748, 646621, 647495, 648369, 649243, 650117, 650990, 651864, 652738, 653612, 654486, 655359, 655360, 656233, 657107, 657981, 658855, 659729, 660602, 661476, 662350, 663224, 664098, 664971, 664972, 665845, 666719, 667593, 668467, 669341, 670214, 671088, 671962, 672836, 673710, 674583, 675457, 676331, 677205, 678079, 678952, 678953, 679826, 680700, 681574, 682448, 683322, 684195, 685069, 685943, 686817, 687691, 688564, 689438, 690312, 691186, 692060, 692933, 692934, 693807, 694681, 695555, 696429, 697303, 698176, 699050, 699924, 700798, 701672, 702545, 703419, 704293, 705167, 706041, 706914, 706915, 707788, 708662, 709536, 710410, 711284, 712157, 713031, 713905, 714779, 715653, 716526, 717400, 718274, 719148, 720022, 720895, 720896, 721769, 722643, 723517, 724391, 725265, 726138, 727012, 727886, 728760, 729634, 730507, 730508, 731381, 732255, 733129, 734003, 734877, 735750, 736624, 737498, 738372, 739246, 740119, 740993, 741867, 742741, 743615, 744488, 744489, 745362, 746236, 747110, 747984, 748858, 749731, 750605, 751479, 752353, 753227, 754100, 754974, 755848, 756722, 757596, 758469, 758470, 759343, 760217, 761091, 761965, 762839, 763712, 764586, 765460, 766334, 767208, 768081, 768955, 769829, 770703, 771577, 772450, 772451, 773324, 774198, 775072, 775946, 776820, 777693, 778567, 779441, 780315, 781189, 782062, 782936, 783810, 784684, 785558, 786431, 786432, 787305, 788179, 789053, 789927, 790801, 791674, 792548, 793422, 794296, 795170, 796043, 796044, 796917, 797791, 798665, 799539, 800413, 801286, 802160, 803034, 803908, 804782, 805655, 806529, 807403, 808277, 809151, 810024, 810025, 810898, 811772, 812646, 813520, 814394, 815267, 816141, 817015, 817889, 818763, 819636, 820510, 821384, 822258, 823132, 824005, 824006, 824879, 825753, 826627, 827501, 828375, 829248, 830122, 830996, 831870, 832744, 833617, 834491, 835365, 836239, 837113, 837986, 837987, 838860, 839734, 840608, 841482, 842356, 843229, 844103, 844977, 845851, 846725, 847598, 848472, 849346, 850220, 851094, 851967, 851968, 852841, 853715, 854589, 855463, 856337, 857210, 858084, 858958, 859832, 860706, 861579, 861580, 862453, 863327, 864201, 865075, 865949, 866822, 867696, 868570, 869444, 870318, 871191, 872065, 872939, 873813, 874687, 875560, 875561, 876434, 877308, 878182, 879056, 879930, 880803, 881677, 882551, 883425, 884299, 885172, 886046, 886920, 887794, 888668, 889541, 889542, 890415, 891289, 892163, 893037, 893911, 894784, 895658, 896532, 897406, 898280, 899153, 900027, 900901, 901775, 902649, 903522, 903523, 904396, 905270, 906144, 907018, 907892, 908765, 909639, 910513, 911387, 912261, 913134, 914008, 914882, 915756, 916630, 917503, 917504, 918377, 919251, 920125, 920999, 921873, 922746, 923620, 924494, 925368, 926242, 927115, 927116, 927989, 928863, 929737, 930611, 931485, 932358, 933232, 934106, 934980, 935854, 936727, 937601, 938475, 939349, 940223, 941096, 941097, 941970, 942844, 943718, 944592, 945466, 946339, 947213, 948087, 948961, 949835, 950708, 951582, 952456, 953330, 954204, 955077, 955078, 955951, 956825, 957699, 958573, 959447, 960320, 961194, 962068, 962942, 963816, 964689, 965563, 966437, 967311, 968185, 969058, 969059, 969932, 970806, 971680, 972554, 973428, 974301, 975175, 976049, 976923, 977797, 978670, 979544, 980418, 981292, 982166, 983040, 983913, 984787, 985661, 986535, 987409, 988282, 989156, 990030, 990904, 991778, 992651, 992652, 993525, 994399, 995273, 996147, 997021, 997894, 998768, 999642, 1000516, 1001390, 1002263, 1003137, 1004011, 1004885, 1005759, 1006632, 1006633, 1007506, 1008380, 1009254, 1010128, 1011002, 1011875, 1012749, 1013623, 1014497, 1015371, 1016244, 1017118, 1017992, 1018866, 1019740, 1020613, 1020614, 1021487, 1022361, 1023235, 1024109, 1024983, 1025856, 1026730, 1027604, 1028478, 1029352, 1030225, 1031099, 1031973, 1032847, 1033721, 1034594, 1034595, 1035468, 1036342, 1037216, 1038090, 1038964, 1039837, 1040711, 1041585, 1042459, 1043333, 1044206, 1045080, 1045954, 1046828, 1047702, 1048575, 1048576, 1050323, 1052071, 1053818, 1053819, 1055566, 1057314, 1059061, 1060809, 1062557, 1064304, 1066052, 1067799, 1067800, 1069547, 1071295, 1073042, 1074790, 1076538, 1078285, 1080033, 1081780, 1081781, 1083528, 1085276, 1087023, 1088771, 1090519, 1092266, 1094014, 1095761, 1095762, 1097509, 1099257, 1101004, 1102752, 1104500, 1106247, 1107995, 1109742, 1109743, 1111490, 1113238, 1114985, 1116733, 1118481, 1120228, 1121976, 1123723, 1123724, 1125471, 1127219, 1128966, 1130714, 1132462, 1134209, 1135957, 1137704, 1137705, 1139452, 1141200, 1142947, 1144695, 1146443, 1148190, 1149938, 1151685, 1151686, 1153433, 1155181, 1156928, 1158676, 1160424, 1162171, 1163919, 1165666, 1165667, 1167414, 1169162, 1170909, 1172657, 1174405, 1176152, 1177900, 1179647, 1179648, 1181395, 1183143, 1184890, 1184891, 1186638, 1188386, 1190133, 1191881, 1193629, 1195376, 1197124, 1198871, 1198872, 1200619, 1202367, 1204114, 1205862, 1207610, 1209357, 1211105, 1212852, 1212853, 1214600, 1216348, 1218095, 1219843, 1221591, 1223338, 1225086, 1226833, 1226834, 1228581, 1230329, 1232076, 1233824, 1235572, 1237319, 1239067, 1240814, 1240815, 1242562, 1244310, 1246057, 1247805, 1249553, 1251300, 1253048, 1254795, 1254796, 1256543, 1258291, 1260038, 1261786, 1263534, 1265281, 1267029, 1268776, 1268777, 1270524, 1272272, 1274019, 1275767, 1277515, 1279262, 1281010, 1282757, 1282758, 1284505, 1286253, 1288000, 1289748, 1291496, 1293243, 1294991, 1296738, 1296739, 1298486, 1300234, 1301981, 1303729, 1305477, 1307224, 1308972, 1310719, 1310720, 1312467, 1314215, 1315962, 1315963, 1317710, 1319458, 1321205, 1322953, 1324701, 1326448, 1328196, 1329943, 1329944, 1331691, 1333439, 1335186, 1336934, 1338682, 1340429, 1342177, 1343924, 1343925, 1345672, 1347420, 1349167, 1350915, 1352663, 1354410, 1356158, 1357905, 1357906, 1359653, 1361401, 1363148, 1364896, 1366644, 1368391, 1370139, 1371886, 1371887, 1373634, 1375382, 1377129, 1378877, 1380625, 1382372, 1384120, 1385867, 1385868, 1387615, 1389363, 1391110, 1392858, 1394606, 1396353, 1398101, 1399848, 1399849, 1401596, 1403344, 1405091, 1406839, 1408587, 1410334, 1412082, 1413829, 1413830, 1415577, 1417325, 1419072, 1420820, 1422568, 1424315, 1426063, 1427810, 1427811, 1429558, 1431306, 1433053, 1434801, 1436549, 1438296, 1440044, 1441791, 1441792, 1443539, 1445287, 1447034, 1447035, 1448782, 1450530, 1452277, 1454025, 1455773, 1457520, 1459268, 1461015, 1461016, 1462763, 1464511, 1466258, 1468006, 1469754, 1471501, 1473249, 1474996, 1474997, 1476744, 1478492, 1480239, 1481987, 1483735, 1485482, 1487230, 1488977, 1488978, 1490725, 1492473, 1494220, 1495968, 1497716, 1499463, 1501211, 1502958, 1502959, 1504706, 1506454, 1508201, 1509949, 1511697, 1513444, 1515192, 1516939, 1516940, 1518687, 1520435, 1522182, 1523930, 1525678, 1527425, 1529173, 1530920, 1530921, 1532668, 1534416, 1536163, 1537911, 1539659, 1541406, 1543154, 1544901, 1544902, 1546649, 1548397, 1550144, 1551892, 1553640, 1555387, 1557135, 1558882, 1558883, 1560630, 1562378, 1564125, 1565873, 1567621, 1569368, 1571116, 1572863, 1572864, 1574611, 1576359, 1578106, 1578107, 1579854, 1581602, 1583349, 1585097, 1586845, 1588592, 1590340, 1592087, 1592088, 1593835, 1595583, 1597330, 1599078, 1600826, 1602573, 1604321, 1606068, 1606069, 1607816, 1609564, 1611311, 1613059, 1614807, 1616554, 1618302, 1620049, 1620050, 1621797, 1623545, 1625292, 1627040, 1628788, 1630535, 1632283, 1634030, 1634031, 1635778, 1637526, 1639273, 1641021, 1642769, 1644516, 1646264, 1648011, 1648012, 1649759, 1651507, 1653254, 1655002, 1656750, 1658497, 1660245, 1661992, 1661993, 1663740, 1665488, 1667235, 1668983, 1670731, 1672478, 1674226, 1675973, 1675974, 1677721, 1679469, 1681216, 1682964, 1684712, 1686459, 1688207, 1689954, 1689955, 1691702, 1693450, 1695197, 1696945, 1698693, 1700440, 1702188, 1703935, 1703936, 1705683, 1707431, 1709178, 1709179, 1710926, 1712674, 1714421, 1716169, 1717917, 1719664, 1721412, 1723159, 1723160, 1724907, 1726655, 1728402, 1730150, 1731898, 1733645, 1735393, 1737140, 1737141, 1738888, 1740636, 1742383, 1744131, 1745879, 1747626, 1749374, 1751121, 1751122, 1752869, 1754617, 1756364, 1758112, 1759860, 1761607, 1763355, 1765102, 1765103, 1766850, 1768598, 1770345, 1772093, 1773841, 1775588, 1777336, 1779083, 1779084, 1780831, 1782579, 1784326, 1786074, 1787822, 1789569, 1791317, 1793064, 1793065, 1794812, 1796560, 1798307, 1800055, 1801803, 1803550, 1805298, 1807045, 1807046, 1808793, 1810541, 1812288, 1814036, 1815784, 1817531, 1819279, 1821026, 1821027, 1822774, 1824522, 1826269, 1828017, 1829765, 1831512, 1833260, 1835007, 1835008, 1836755, 1838503, 1840250, 1840251, 1841998, 1843746, 1845493, 1847241, 1848989, 1850736, 1852484, 1854231, 1854232, 1855979, 1857727, 1859474, 1861222, 1862970, 1864717, 1866465, 1868212, 1868213, 1869960, 1871708, 1873455, 1875203, 1876951, 1878698, 1880446, 1882193, 1882194, 1883941, 1885689, 1887436, 1889184, 1890932, 1892679, 1894427, 1896174, 1896175, 1897922, 1899670, 1901417, 1903165, 1904913, 1906660, 1908408, 1910155, 1910156, 1911903, 1913651, 1915398, 1917146, 1918894, 1920641, 1922389, 1924136, 1924137, 1925884, 1927632, 1929379, 1931127, 1932875, 1934622, 1936370, 1938117, 1938118, 1939865, 1941613, 1943360, 1945108, 1946856, 1948603, 1950351, 1952098, 1952099, 1953846, 1955594, 1957341, 1959089, 1960837, 1962584, 1964332, 1966080, 1967827, 1969575, 1971322, 1971323, 1973070, 1974818, 1976565, 1978313, 1980061, 1981808, 1983556, 1985303, 1985304, 1987051, 1988799, 1990546, 1992294, 1994042, 1995789, 1997537, 1999284, 1999285, 2001032, 2002780, 2004527, 2006275, 2008023, 2009770, 2011518, 2013265, 2013266, 2015013, 2016761, 2018508, 2020256, 2022004, 2023751, 2025499, 2027246, 2027247, 2028994, 2030742, 2032489, 2034237, 2035985, 2037732, 2039480, 2041227, 2041228, 2042975, 2044723, 2046470, 2048218, 2049966, 2051713, 2053461, 2055208, 2055209, 2056956, 2058704, 2060451, 2062199, 2063947, 2065694, 2067442, 2069189, 2069190, 2070937, 2072685, 2074432, 2076180, 2077928, 2079675, 2081423, 2083170, 2083171, 2084918, 2086666, 2088413, 2090161, 2091909, 2093656, 2095404, 2097151, 2097152, 2100647, 2104142, 2107637, 2107638, 2111133, 2114628, 2118123, 2121618, 2121619, 2125114, 2128609, 2132104, 2135599, 2135600, 2139095, 2142590, 2146085, 2149580, 2149581, 2153076, 2156571, 2160066, 2163561, 2163562, 2167057, 2170552, 2174047, 2177542, 2177543, 2181038, 2184533, 2188028, 2191523, 2191524, 2195019, 2198514, 2202009, 2205504, 2205505, 2209000, 2212495, 2215990, 2219485, 2219486, 2222981, 2226476, 2229971, 2233466, 2233467, 2236962, 2240457, 2243952, 2247447, 2247448, 2250943, 2254438, 2257933, 2261428, 2261429, 2264924, 2268419, 2271914, 2275409, 2275410, 2278905, 2282400, 2285895, 2289390, 2289391, 2292886, 2296381, 2299876, 2303371, 2303372, 2306867, 2310362, 2313857, 2317352, 2317353, 2320848, 2324343, 2327838, 2331333, 2331334, 2334829, 2338324, 2341819, 2345314, 2345315, 2348810, 2352305, 2355800, 2359295, 2359296, 2362791, 2366286, 2369781, 2369782, 2373277, 2376772, 2380267, 2383762, 2383763, 2387258, 2390753, 2394248, 2397743, 2397744, 2401239, 2404734, 2408229, 2411724, 2411725, 2415220, 2418715, 2422210, 2425705, 2425706, 2429201, 2432696, 2436191, 2439686, 2439687, 2443182, 2446677, 2450172, 2453667, 2453668, 2457163, 2460658, 2464153, 2467648, 2467649, 2471144, 2474639, 2478134, 2481629, 2481630, 2485125, 2488620, 2492115, 2495610, 2495611, 2499106, 2502601, 2506096, 2509591, 2509592, 2513087, 2516582, 2520077, 2523572, 2523573, 2527068, 2530563, 2534058, 2537553, 2537554, 2541049, 2544544, 2548039, 2551534, 2551535, 2555030, 2558525, 2562020, 2565515, 2565516, 2569011, 2572506, 2576001, 2579496, 2579497, 2582992, 2586487, 2589982, 2593477, 2593478, 2596973, 2600468, 2603963, 2607458, 2607459, 2610954, 2614449, 2617944, 2621439, 2621440, 2624935, 2628430, 2631925, 2631926, 2635421, 2638916, 2642411, 2645906, 2645907, 2649402, 2652897, 2656392, 2659887, 2659888, 2663383, 2666878, 2670373, 2673868, 2673869, 2677364, 2680859, 2684354, 2687849, 2687850, 2691345, 2694840, 2698335, 2701830, 2701831, 2705326, 2708821, 2712316, 2715811, 2715812, 2719307, 2722802, 2726297, 2729792, 2729793, 2733288, 2736783, 2740278, 2743773, 2743774, 2747269, 2750764, 2754259, 2757754, 2757755, 2761250, 2764745, 2768240, 2771735, 2771736, 2775231, 2778726, 2782221, 2785716, 2785717, 2789212, 2792707, 2796202, 2799697, 2799698, 2803193, 2806688, 2810183, 2813678, 2813679, 2817174, 2820669, 2824164, 2827659, 2827660, 2831155, 2834650, 2838145, 2841640, 2841641, 2845136, 2848631, 2852126, 2855621, 2855622, 2859117, 2862612, 2866107, 2869602, 2869603, 2873098, 2876593, 2880088, 2883583, 2883584, 2887079, 2890574, 2894069, 2894070, 2897565, 2901060, 2904555, 2908050, 2908051, 2911546, 2915041, 2918536, 2922031, 2922032, 2925527, 2929022, 2932517, 2936012, 2936013, 2939508, 2943003, 2946498, 2949993, 2949994, 2953489, 2956984, 2960479, 2963974, 2963975, 2967470, 2970965, 2974460, 2977955, 2977956, 2981451, 2984946, 2988441, 2991936, 2991937, 2995432, 2998927, 3002422, 3005917, 3005918, 3009413, 3012908, 3016403, 3019898, 3019899, 3023394, 3026889, 3030384, 3033879, 3033880, 3037375, 3040870, 3044365, 3047860, 3047861, 3051356, 3054851, 3058346, 3061841, 3061842, 3065337, 3068832, 3072327, 3075822, 3075823, 3079318, 3082813, 3086308, 3089803, 3089804, 3093299, 3096794, 3100289, 3103784, 3103785, 3107280, 3110775, 3114270, 3117765, 3117766, 3121261, 3124756, 3128251, 3131746, 3131747, 3135242, 3138737, 3142232, 3145727, 3145728, 3149223, 3152718, 3156213, 3156214, 3159709, 3163204, 3166699, 3170194, 3170195, 3173690, 3177185, 3180680, 3184175, 3184176, 3187671, 3191166, 3194661, 3198156, 3198157, 3201652, 3205147, 3208642, 3212137, 3212138, 3215633, 3219128, 3222623, 3226118, 3226119, 3229614, 3233109, 3236604, 3240099, 3240100, 3243595, 3247090, 3250585, 3254080, 3254081, 3257576, 3261071, 3264566, 3268061, 3268062, 3271557, 3275052, 3278547, 3282042, 3282043, 3285538, 3289033, 3292528, 3296023, 3296024, 3299519, 3303014, 3306509, 3310004, 3310005, 3313500, 3316995, 3320490, 3323985, 3323986, 3327481, 3330976, 3334471, 3337966, 3337967, 3341462, 3344957, 3348452, 3351947, 3351948, 3355443, 3358938, 3362433, 3365928, 3365929, 3369424, 3372919, 3376414, 3379909, 3379910, 3383405, 3386900, 3390395, 3393890, 3393891, 3397386, 3400881, 3404376, 3407871, 3407872, 3411367, 3414862, 3418357, 3418358, 3421853, 3425348, 3428843, 3432338, 3432339, 3435834, 3439329, 3442824, 3446319, 3446320, 3449815, 3453310, 3456805, 3460300, 3460301, 3463796, 3467291, 3470786, 3474281, 3474282, 3477777, 3481272, 3484767, 3488262, 3488263, 3491758, 3495253, 3498748, 3502243, 3502244, 3505739, 3509234, 3512729, 3516224, 3516225, 3519720, 3523215, 3526710, 3530205, 3530206, 3533701, 3537196, 3540691, 3544186, 3544187, 3547682, 3551177, 3554672, 3558167, 3558168, 3561663, 3565158, 3568653, 3572148, 3572149, 3575644, 3579139, 3582634, 3586129, 3586130, 3589625, 3593120, 3596615, 3600110, 3600111, 3603606, 3607101, 3610596, 3614091, 3614092, 3617587, 3621082, 3624577, 3628072, 3628073, 3631568, 3635063, 3638558, 3642053, 3642054, 3645549, 3649044, 3652539, 3656034, 3656035, 3659530, 3663025, 3666520, 3670015, 3670016, 3673511, 3677006, 3680501, 3680502, 3683997, 3687492, 3690987, 3694482, 3694483, 3697978, 3701473, 3704968, 3708463, 3708464, 3711959, 3715454, 3718949, 3722444, 3722445, 3725940, 3729435, 3732930, 3736425, 3736426, 3739921, 3743416, 3746911, 3750406, 3750407, 3753902, 3757397, 3760892, 3764387, 3764388, 3767883, 3771378, 3774873, 3778368, 3778369, 3781864, 3785359, 3788854, 3792349, 3792350, 3795845, 3799340, 3802835, 3806330, 3806331, 3809826, 3813321, 3816816, 3820311, 3820312, 3823807, 3827302, 3830797, 3834292, 3834293, 3837788, 3841283, 3844778, 3848273, 3848274, 3851769, 3855264, 3858759, 3862254, 3862255, 3865750, 3869245, 3872740, 3876235, 3876236, 3879731, 3883226, 3886721, 3890216, 3890217, 3893712, 3897207, 3900702, 3904197, 3904198, 3907693, 3911188, 3914683, 3918178, 3918179, 3921674, 3925169, 3928664, 3932160, 3935655, 3939150, 3942645, 3942646, 3946141, 3949636, 3953131, 3956626, 3956627, 3960122, 3963617, 3967112, 3970607, 3970608, 3974103, 3977598, 3981093, 3984588, 3984589, 3988084, 3991579, 3995074, 3998569, 3998570, 4002065, 4005560, 4009055, 4012550, 4012551, 4016046, 4019541, 4023036, 4026531, 4026532, 4030027, 4033522, 4037017, 4040512, 4040513, 4044008, 4047503, 4050998, 4054493, 4054494, 4057989, 4061484, 4064979, 4068474, 4068475, 4071970, 4075465, 4078960, 4082455, 4082456, 4085951, 4089446, 4092941, 4096436, 4096437, 4099932, 4103427, 4106922, 4110417, 4110418, 4113913, 4117408, 4120903, 4124398, 4124399, 4127894, 4131389, 4134884, 4138379, 4138380, 4141875, 4145370, 4148865, 4152360, 4152361, 4155856, 4159351, 4162846, 4166341, 4166342, 4169837, 4173332, 4176827, 4180322, 4180323, 4183818, 4187313, 4190808, 4194303, 4194304, 4201294, 4201295, 4208285, 4215275, 4215276, 4222266, 4229256, 4229257, 4236247, 4243237, 4243238, 4250228, 4257218, 4257219, 4264209, 4271199, 4271200, 4278190, 4285180, 4285181, 4292171, 4299161, 4299162, 4306152, 4313142, 4313143, 4320133, 4327123, 4327124, 4334114, 4341104, 4341105, 4348095, 4355085, 4355086, 4362076, 4369066, 4369067, 4376057, 4383047, 4383048, 4390038, 4397028, 4397029, 4404019, 4411009, 4411010, 4418000, 4424990, 4424991, 4431981, 4438971, 4438972, 4445962, 4452952, 4452953, 4459943, 4466933, 4466934, 4473924, 4480914, 4480915, 4487905, 4494895, 4494896, 4501886, 4508876, 4508877, 4515867, 4522857, 4522858, 4529848, 4536838, 4536839, 4543829, 4550819, 4550820, 4557810, 4564800, 4564801, 4571791, 4578781, 4578782, 4585772, 4592762, 4592763, 4599753, 4606743, 4606744, 4613734, 4620724, 4620725, 4627715, 4634705, 4634706, 4641696, 4648686, 4648687, 4655677, 4662667, 4662668, 4669658, 4676648, 4676649, 4683639, 4690629, 4690630, 4697620, 4704610, 4704611, 4711601, 4718591, 4718592, 4725582, 4725583, 4732573, 4739563, 4739564, 4746554, 4753544, 4753545, 4760535, 4767525, 4767526, 4774516, 4781506, 4781507, 4788497, 4795487, 4795488, 4802478, 4809468, 4809469, 4816459, 4823449, 4823450, 4830440, 4837430, 4837431, 4844421, 4851411, 4851412, 4858402, 4865392, 4865393, 4872383, 4879373, 4879374, 4886364, 4893354, 4893355, 4900345, 4907335, 4907336, 4914326, 4921316, 4921317, 4928307, 4935297, 4935298, 4942288, 4949278, 4949279, 4956269, 4963259, 4963260, 4970250, 4977240, 4977241, 4984231, 4991221, 4991222, 4998212, 5005202, 5005203, 5012193, 5019183, 5019184, 5026174, 5033164, 5033165, 5040155, 5047145, 5047146, 5054136, 5061126, 5061127, 5068117, 5075107, 5075108, 5082098, 5089088, 5089089, 5096079, 5103069, 5103070, 5110060, 5117050, 5117051, 5124041, 5131031, 5131032, 5138022, 5145012, 5145013, 5152003, 5158993, 5158994, 5165984, 5172974, 5172975, 5179965, 5186955, 5186956, 5193946, 5200936, 5200937, 5207927, 5214917, 5214918, 5221908, 5228898, 5228899, 5235889, 5242879, 5242880, 5249870, 5249871, 5256861, 5263851, 5263852, 5270842, 5277832, 5277833, 5284823, 5291813, 5291814, 5298804, 5305794, 5305795, 5312785, 5319775, 5319776, 5326766, 5333756, 5333757, 5340747, 5347737, 5347738, 5354728, 5361718, 5361719, 5368709, 5375699, 5375700, 5382690, 5389680, 5389681, 5396671, 5403661, 5403662, 5410652, 5417642, 5417643, 5424633, 5431623, 5431624, 5438614, 5445604, 5445605, 5452595, 5459585, 5459586, 5466576, 5473566, 5473567, 5480557, 5487547, 5487548, 5494538, 5501528, 5501529, 5508519, 5515509, 5515510, 5522500, 5529490, 5529491, 5536481, 5543471, 5543472, 5550462, 5557452, 5557453, 5564443, 5571433, 5571434, 5578424, 5585414, 5585415, 5592405, 5599395, 5599396, 5606386, 5613376, 5613377, 5620367, 5627357, 5627358, 5634348, 5641338, 5641339, 5648329, 5655319, 5655320, 5662310, 5669300, 5669301, 5676291, 5683281, 5683282, 5690272, 5697262, 5697263, 5704253, 5711243, 5711244, 5718234, 5725224, 5725225, 5732215, 5739205, 5739206, 5746196, 5753186, 5753187, 5760177, 5767167, 5767168, 5774158, 5774159, 5781149, 5788139, 5788140, 5795130, 5802120, 5802121, 5809111, 5816101, 5816102, 5823092, 5830082, 5830083, 5837073, 5844063, 5844064, 5851054, 5858044, 5858045, 5865035, 5872025, 5872026, 5879016, 5886006, 5886007, 5892997, 5899987, 5899988, 5906978, 5913968, 5913969, 5920959, 5927949, 5927950, 5934940, 5941930, 5941931, 5948921, 5955911, 5955912, 5962902, 5969892, 5969893, 5976883, 5983873, 5983874, 5990864, 5997854, 5997855, 6004845, 6011835, 6011836, 6018826, 6025816, 6025817, 6032807, 6039797, 6039798, 6046788, 6053778, 6053779, 6060769, 6067759, 6067760, 6074750, 6081740, 6081741, 6088731, 6095721, 6095722, 6102712, 6109702, 6109703, 6116693, 6123683, 6123684, 6130674, 6137664, 6137665, 6144655, 6151645, 6151646, 6158636, 6165626, 6165627, 6172617, 6179607, 6179608, 6186598, 6193588, 6193589, 6200579, 6207569, 6207570, 6214560, 6221550, 6221551, 6228541, 6235531, 6235532, 6242522, 6249512, 6249513, 6256503, 6263493, 6263494, 6270484, 6277474, 6277475, 6284465, 6291455, 6291456, 6298446, 6298447, 6305437, 6312427, 6312428, 6319418, 6326408, 6326409, 6333399, 6340389, 6340390, 6347380, 6354370, 6354371, 6361361, 6368351, 6368352, 6375342, 6382332, 6382333, 6389323, 6396313, 6396314, 6403304, 6410294, 6410295, 6417285, 6424275, 6424276, 6431266, 6438256, 6438257, 6445247, 6452237, 6452238, 6459228, 6466218, 6466219, 6473209, 6480199, 6480200, 6487190, 6494180, 6494181, 6501171, 6508161, 6508162, 6515152, 6522142, 6522143, 6529133, 6536123, 6536124, 6543114, 6550104, 6550105, 6557095, 6564085, 6564086, 6571076, 6578066, 6578067, 6585057, 6592047, 6592048, 6599038, 6606028, 6606029, 6613019, 6620009, 6620010, 6627000, 6633990, 6633991, 6640981, 6647971, 6647972, 6654962, 6661952, 6661953, 6668943, 6675933, 6675934, 6682924, 6689914, 6689915, 6696905, 6703895, 6703896, 6710886, 6717876, 6717877, 6724867, 6731857, 6731858, 6738848, 6745838, 6745839, 6752829, 6759819, 6759820, 6766810, 6773800, 6773801, 6780791, 6787781, 6787782, 6794772, 6801762, 6801763, 6808753, 6815743, 6815744, 6822734, 6822735, 6829725, 6836715, 6836716, 6843706, 6850696, 6850697, 6857687, 6864677, 6864678, 6871668, 6878658, 6878659, 6885649, 6892639, 6892640, 6899630, 6906620, 6906621, 6913611, 6920601, 6920602, 6927592, 6934582, 6934583, 6941573, 6948563, 6948564, 6955554, 6962544, 6962545, 6969535, 6976525, 6976526, 6983516, 6990506, 6990507, 6997497, 7004487, 7004488, 7011478, 7018468, 7018469, 7025459, 7032449, 7032450, 7039440, 7046430, 7046431, 7053421, 7060411, 7060412, 7067402, 7074392, 7074393, 7081383, 7088373, 7088374, 7095364, 7102354, 7102355, 7109345, 7116335, 7116336, 7123326, 7130316, 7130317, 7137307, 7144297, 7144298, 7151288, 7158278, 7158279, 7165269, 7172259, 7172260, 7179250, 7186240, 7186241, 7193231, 7200221, 7200222, 7207212, 7214202, 7214203, 7221193, 7228183, 7228184, 7235174, 7242164, 7242165, 7249155, 7256145, 7256146, 7263136, 7270126, 7270127, 7277117, 7284107, 7284108, 7291098, 7298088, 7298089, 7305079, 7312069, 7312070, 7319060, 7326050, 7326051, 7333041, 7340031, 7340032, 7347022, 7347023, 7354013, 7361003, 7361004, 7367994, 7374984, 7374985, 7381975, 7388965, 7388966, 7395956, 7402946, 7402947, 7409937, 7416927, 7416928, 7423918, 7430908, 7430909, 7437899, 7444889, 7444890, 7451880, 7458870, 7458871, 7465861, 7472851, 7472852, 7479842, 7486832, 7486833, 7493823, 7500813, 7500814, 7507804, 7514794, 7514795, 7521785, 7528775, 7528776, 7535766, 7542756, 7542757, 7549747, 7556737, 7556738, 7563728, 7570718, 7570719, 7577709, 7584699, 7584700, 7591690, 7598680, 7598681, 7605671, 7612661, 7612662, 7619652, 7626642, 7626643, 7633633, 7640623, 7640624, 7647614, 7654604, 7654605, 7661595, 7668585, 7668586, 7675576, 7682566, 7682567, 7689557, 7696547, 7696548, 7703538, 7710528, 7710529, 7717519, 7724509, 7724510, 7731500, 7738490, 7738491, 7745481, 7752471, 7752472, 7759462, 7766452, 7766453, 7773443, 7780433, 7780434, 7787424, 7794414, 7794415, 7801405, 7808395, 7808396, 7815386, 7822376, 7822377, 7829367, 7836357, 7836358, 7843348, 7850338, 7850339, 7857329, 7864320, 7871310, 7871311, 7878301, 7885291, 7885292, 7892282, 7899272, 7899273, 7906263, 7913253, 7913254, 7920244, 7927234, 7927235, 7934225, 7941215, 7941216, 7948206, 7955196, 7955197, 7962187, 7969177, 7969178, 7976168, 7983158, 7983159, 7990149, 7997139, 7997140, 8004130, 8011120, 8011121, 8018111, 8025101, 8025102, 8032092, 8039082, 8039083, 8046073, 8053063, 8053064, 8060054, 8067044, 8067045, 8074035, 8081025, 8081026, 8088016, 8095006, 8095007, 8101997, 8108987, 8108988, 8115978, 8122968, 8122969, 8129959, 8136949, 8136950, 8143940, 8150930, 8150931, 8157921, 8164911, 8164912, 8171902, 8178892, 8178893, 8185883, 8192873, 8192874, 8199864, 8206854, 8206855, 8213845, 8220835, 8220836, 8227826, 8234816, 8234817, 8241807, 8248797, 8248798, 8255788, 8262778, 8262779, 8269769, 8276759, 8276760, 8283750, 8290740, 8290741, 8297731, 8304721, 8304722, 8311712, 8318702, 8318703, 8325693, 8332683, 8332684, 8339674, 8346664, 8346665, 8353655, 8360645, 8360646, 8367636, 8374626, 8374627, 8381617, 8388607) ORDER BY i ASC ;'
r2 = await pool.query(sql2);

timeend('nojoin');



timestart('join');
sql1 = 'SELECT mock3_om3.i, mock3_om3.minvd, mock3_om3.maxvd, mock4_om3.minvd, mock4_om3.maxvd FROM mock3_om3 join mock4_om3 on mock3_om3.i=mock4_om3.i where mock3_om3.i in (1024, 1025, 1027, 1029, 1030, 1032, 1034, 1035, 1037, 1039, 1041, 1042, 1044, 1046, 1047, 1049, 1051, 1053, 1054, 1056, 1058, 1059, 1061, 1063, 1064, 1066, 1068, 1070, 1071, 1073, 1075, 1076, 1078, 1080, 1082, 1083, 1085, 1087, 1088, 1090, 1092, 1093, 1095, 1097, 1099, 1100, 1102, 1104, 1105, 1107, 1109, 1111, 1112, 1114, 1116, 1117, 1119, 1121, 1122, 1124, 1126, 1128, 1129, 1131, 1133, 1134, 1136, 1138, 1140, 1141, 1143, 1145, 1146, 1148, 1150, 1151, 1152, 1153, 1155, 1157, 1158, 1160, 1162, 1163, 1165, 1167, 1169, 1170, 1172, 1174, 1175, 1177, 1179, 1181, 1182, 1184, 1186, 1187, 1189, 1191, 1192, 1194, 1196, 1198, 1199, 1201, 1203, 1204, 1206, 1208, 1210, 1211, 1213, 1215, 1216, 1218, 1220, 1221, 1223, 1225, 1227, 1228, 1230, 1232, 1233, 1235, 1237, 1239, 1240, 1242, 1244, 1245, 1247, 1249, 1250, 1252, 1254, 1256, 1257, 1259, 1261, 1262, 1264, 1266, 1268, 1269, 1271, 1273, 1274, 1276, 1278, 1279, 1280, 1281, 1283, 1285, 1286, 1288, 1290, 1291, 1293, 1295, 1297, 1298, 1300, 1302, 1303, 1305, 1307, 1309, 1310, 1312, 1314, 1315, 1317, 1319, 1320, 1322, 1324, 1326, 1327, 1329, 1331, 1332, 1334, 1336, 1338, 1339, 1341, 1343, 1344, 1346, 1348, 1349, 1351, 1353, 1355, 1356, 1358, 1360, 1361, 1363, 1365, 1367, 1368, 1370, 1372, 1373, 1375, 1377, 1378, 1380, 1382, 1384, 1385, 1387, 1389, 1390, 1392, 1394, 1396, 1397, 1399, 1401, 1402, 1404, 1406, 1407, 1408, 1409, 1411, 1413, 1414, 1416, 1418, 1419, 1421, 1423, 1425, 1426, 1428, 1430, 1431, 1433, 1435, 1437, 1438, 1440, 1442, 1443, 1445, 1447, 1448, 1450, 1452, 1454, 1455, 1457, 1459, 1460, 1462, 1464, 1466, 1467, 1469, 1471, 1472, 1474, 1476, 1477, 1479, 1481, 1483, 1484, 1486, 1488, 1489, 1491, 1493, 1495, 1496, 1498, 1500, 1501, 1503, 1505, 1506, 1508, 1510, 1512, 1513, 1515, 1517, 1518, 1520, 1522, 1524, 1525, 1527, 1529, 1530, 1532, 1534, 1535, 1536, 1537, 1539, 1541, 1542, 1544, 1546, 1547, 1549, 1551, 1553, 1554, 1556, 1558, 1559, 1561, 1563, 1565, 1566, 1568, 1570, 1571, 1573, 1575, 1576, 1578, 1580, 1582, 1583, 1585, 1587, 1588, 1590, 1592, 1594, 1595, 1597, 1599, 1600, 1602, 1604, 1605, 1607, 1609, 1611, 1612, 1614, 1616, 1617, 1619, 1621, 1623, 1624, 1626, 1628, 1629, 1631, 1633, 1634, 1636, 1638, 1640, 1641, 1643, 1645, 1646, 1648, 1650, 1652, 1653, 1655, 1657, 1658, 1660, 1662, 1663, 1664, 1665, 1667, 1669, 1670, 1672, 1674, 1675, 1677, 1679, 1681, 1682, 1684, 1686, 1687, 1689, 1691, 1693, 1694, 1696, 1698, 1699, 1701, 1703, 1704, 1706, 1708, 1710, 1711, 1713, 1715, 1716, 1718, 1720, 1722, 1723, 1725, 1727, 1728, 1730, 1732, 1733, 1735, 1737, 1739, 1740, 1742, 1744, 1745, 1747, 1749, 1751, 1752, 1754, 1756, 1757, 1759, 1761, 1762, 1764, 1766, 1768, 1769, 1771, 1773, 1774, 1776, 1778, 1780, 1781, 1783, 1785, 1786, 1788, 1790, 1791, 1792, 1793, 1795, 1797, 1798, 1800, 1802, 1803, 1805, 1807, 1809, 1810, 1812, 1814, 1815, 1817, 1819, 1821, 1822, 1824, 1826, 1827, 1829, 1831, 1832, 1834, 1836, 1838, 1839, 1841, 1843, 1844, 1846, 1848, 1850, 1851, 1853, 1855, 1856, 1858, 1860, 1861, 1863, 1865, 1867, 1868, 1870, 1872, 1873, 1875, 1877, 1879, 1880, 1882, 1884, 1885, 1887, 1889, 1890, 1892, 1894, 1896, 1897, 1899, 1901, 1902, 1904, 1906, 1908, 1909, 1911, 1913, 1914, 1916, 1918, 1920, 1921, 1923, 1925, 1926, 1928, 1930, 1931, 1933, 1935, 1937, 1938, 1940, 1942, 1943, 1945, 1947, 1949, 1950, 1952, 1954, 1955, 1957, 1959, 1960, 1962, 1964, 1966, 1967, 1969, 1971, 1972, 1974, 1976, 1978, 1979, 1981, 1983, 1984, 1986, 1988, 1989, 1991, 1993, 1995, 1996, 1998, 2000, 2001, 2003, 2005, 2007, 2008, 2010, 2012, 2013, 2015, 2017, 2018, 2020, 2022, 2024, 2025, 2027, 2029, 2030, 2032, 2034, 2036, 2037, 2039, 2041, 2042, 2044, 2046, 2047, 2048, 2051, 2054, 2058, 2061, 2065, 2068, 2071, 2075, 2078, 2082, 2085, 2088, 2092, 2095, 2099, 2102, 2106, 2109, 2112, 2116, 2119, 2123, 2126, 2129, 2133, 2136, 2140, 2143, 2146, 2150, 2153, 2157, 2160, 2164, 2167, 2170, 2174, 2177, 2181, 2184, 2187, 2191, 2194, 2198, 2201, 2205, 2208, 2211, 2215, 2218, 2222, 2225, 2228, 2232, 2235, 2239, 2242, 2245, 2249, 2252, 2256, 2259, 2263, 2266, 2269, 2273, 2276, 2280, 2283, 2286, 2290, 2293, 2297, 2300, 2303, 2304, 2307, 2310, 2314, 2317, 2321, 2324, 2327, 2331, 2334, 2338, 2341, 2344, 2348, 2351, 2355, 2358, 2362, 2365, 2368, 2372, 2375, 2379, 2382, 2385, 2389, 2392, 2396, 2399, 2402, 2406, 2409, 2413, 2416, 2420, 2423, 2426, 2430, 2433, 2437, 2440, 2443, 2447, 2450, 2454, 2457, 2461, 2464, 2467, 2471, 2474, 2478, 2481, 2484, 2488, 2491, 2495, 2498, 2501, 2505, 2508, 2512, 2515, 2519, 2522, 2525, 2529, 2532, 2536, 2539, 2542, 2546, 2549, 2553, 2556, 2559, 2560, 2563, 2566, 2570, 2573, 2577, 2580, 2583, 2587, 2590, 2594, 2597, 2600, 2604, 2607, 2611, 2614, 2618, 2621, 2624, 2628, 2631, 2635, 2638, 2641, 2645, 2648, 2652, 2655, 2658, 2662, 2665, 2669, 2672, 2676, 2679, 2682, 2686, 2689, 2693, 2696, 2699, 2703, 2706, 2710, 2713, 2717, 2720, 2723, 2727, 2730, 2734, 2737, 2740, 2744, 2747, 2751, 2754, 2757, 2761, 2764, 2768, 2771, 2775, 2778, 2781, 2785, 2788, 2792, 2795, 2798, 2802, 2805, 2809, 2812, 2815, 2816, 2819, 2822, 2826, 2829, 2833, 2836, 2839, 2843, 2846, 2850, 2853, 2856, 2860, 2863, 2867, 2870, 2874, 2877, 2880, 2884, 2887, 2891, 2894, 2897, 2901, 2904, 2908, 2911, 2914, 2918, 2921, 2925, 2928, 2932, 2935, 2938, 2942, 2945, 2949, 2952, 2955, 2959, 2962, 2966, 2969, 2973, 2976, 2979, 2983, 2986, 2990, 2993, 2996, 3000, 3003, 3007, 3010, 3013, 3017, 3020, 3024, 3027, 3031, 3034, 3037, 3041, 3044, 3048, 3051, 3054, 3058, 3061, 3065, 3068, 3071, 3072, 3075, 3078, 3082, 3085, 3089, 3092, 3095, 3099, 3102, 3106, 3109, 3112, 3116, 3119, 3123, 3126, 3130, 3133, 3136, 3140, 3143, 3147, 3150, 3153, 3157, 3160, 3164, 3167, 3170, 3174, 3177, 3181, 3184, 3188, 3191, 3194, 3198, 3201, 3205, 3208, 3211, 3215, 3218, 3222, 3225, 3229, 3232, 3235, 3239, 3242, 3246, 3249, 3252, 3256, 3259, 3263, 3266, 3269, 3273, 3276, 3280, 3283, 3287, 3290, 3293, 3297, 3300, 3304, 3307, 3310, 3314, 3317, 3321, 3324, 3327, 3328, 3331, 3334, 3338, 3341, 3345, 3348, 3351, 3355, 3358, 3362, 3365, 3368, 3372, 3375, 3379, 3382, 3386, 3389, 3392, 3396, 3399, 3403, 3406, 3409, 3413, 3416, 3420, 3423, 3426, 3430, 3433, 3437, 3440, 3444, 3447, 3450, 3454, 3457, 3461, 3464, 3467, 3471, 3474, 3478, 3481, 3485, 3488, 3491, 3495, 3498, 3502, 3505, 3508, 3512, 3515, 3519, 3522, 3525, 3529, 3532, 3536, 3539, 3543, 3546, 3549, 3553, 3556, 3560, 3563, 3566, 3570, 3573, 3577, 3580, 3583, 3584, 3587, 3590, 3594, 3597, 3601, 3604, 3607, 3611, 3614, 3618, 3621, 3624, 3628, 3631, 3635, 3638, 3642, 3645, 3648, 3652, 3655, 3659, 3662, 3665, 3669, 3672, 3676, 3679, 3682, 3686, 3689, 3693, 3696, 3700, 3703, 3706, 3710, 3713, 3717, 3720, 3723, 3727, 3730, 3734, 3737, 3741, 3744, 3747, 3751, 3754, 3758, 3761, 3764, 3768, 3771, 3775, 3778, 3781, 3785, 3788, 3792, 3795, 3799, 3802, 3805, 3809, 3812, 3816, 3819, 3822, 3826, 3829, 3833, 3836, 3840, 3843, 3846, 3850, 3853, 3857, 3860, 3863, 3867, 3870, 3874, 3877, 3880, 3884, 3887, 3891, 3894, 3898, 3901, 3904, 3908, 3911, 3915, 3918, 3921, 3925, 3928, 3932, 3935, 3938, 3942, 3945, 3949, 3952, 3956, 3959, 3962, 3966, 3969, 3973, 3976, 3979, 3983, 3986, 3990, 3993, 3997, 4000, 4003, 4007, 4010, 4014, 4017, 4020, 4024, 4027, 4031, 4034, 4037, 4041, 4044, 4048, 4051, 4055, 4058, 4061, 4065, 4068, 4072, 4075, 4078, 4082, 4085, 4089, 4092, 4095, 4096, 4102, 4109, 4116, 4123, 4130, 4136, 4143, 4150, 4157, 4164, 4171, 4177, 4184, 4191, 4198, 4205, 4212, 4218, 4225, 4232, 4239, 4246, 4253, 4259, 4266, 4273, 4280, 4287, 4293, 4300, 4307, 4314, 4321, 4328, 4334, 4341, 4348, 4355, 4362, 4369, 4375, 4382, 4389, 4396, 4403, 4410, 4416, 4423, 4430, 4437, 4444, 4450, 4457, 4464, 4471, 4478, 4485, 4491, 4498, 4505, 4512, 4519, 4526, 4532, 4539, 4546, 4553, 4560, 4567, 4573, 4580, 4587, 4594, 4601, 4607, 4608, 4614, 4621, 4628, 4635, 4642, 4648, 4655, 4662, 4669, 4676, 4683, 4689, 4696, 4703, 4710, 4717, 4724, 4730, 4737, 4744, 4751, 4758, 4765, 4771, 4778, 4785, 4792, 4799, 4805, 4812, 4819, 4826, 4833, 4840, 4846, 4853, 4860, 4867, 4874, 4881, 4887, 4894, 4901, 4908, 4915, 4922, 4928, 4935, 4942, 4949, 4956, 4962, 4969, 4976, 4983, 4990, 4997, 5003, 5010, 5017, 5024, 5031, 5038, 5044, 5051, 5058, 5065, 5072, 5079, 5085, 5092, 5099, 5106, 5113, 5119, 5120, 5126, 5133, 5140, 5147, 5154, 5160, 5167, 5174, 5181, 5188, 5195, 5201, 5208, 5215, 5222, 5229, 5236, 5242, 5249, 5256, 5263, 5270, 5277, 5283, 5290, 5297, 5304, 5311, 5317, 5324, 5331, 5338, 5345, 5352, 5358, 5365, 5372, 5379, 5386, 5393, 5399, 5406, 5413, 5420, 5427, 5434, 5440, 5447, 5454, 5461, 5468, 5474, 5481, 5488, 5495, 5502, 5509, 5515, 5522, 5529, 5536, 5543, 5550, 5556, 5563, 5570, 5577, 5584, 5591, 5597, 5604, 5611, 5618, 5625, 5631, 5632, 5638, 5645, 5652, 5659, 5666, 5672, 5679, 5686, 5693, 5700, 5707, 5713, 5720, 5727, 5734, 5741, 5748, 5754, 5761, 5768, 5775, 5782, 5789, 5795, 5802, 5809, 5816, 5823, 5829, 5836, 5843, 5850, 5857, 5864, 5870, 5877, 5884, 5891, 5898, 5905, 5911, 5918, 5925, 5932, 5939, 5946, 5952, 5959, 5966, 5973, 5980, 5986, 5993, 6000, 6007, 6014, 6021, 6027, 6034, 6041, 6048, 6055, 6062, 6068, 6075, 6082, 6089, 6096, 6103, 6109, 6116, 6123, 6130, 6137, 6143, 6144, 6150, 6157, 6164, 6171, 6178, 6184, 6191, 6198, 6205, 6212, 6219, 6225, 6232, 6239, 6246, 6253, 6260, 6266, 6273, 6280, 6287, 6294, 6301, 6307, 6314, 6321, 6328, 6335, 6341, 6348, 6355, 6362, 6369, 6376, 6382, 6389, 6396, 6403, 6410, 6417, 6423, 6430, 6437, 6444, 6451, 6458, 6464, 6471, 6478, 6485, 6492, 6498, 6505, 6512, 6519, 6526, 6533, 6539, 6546, 6553, 6560, 6567, 6574, 6580, 6587, 6594, 6601, 6608, 6615, 6621, 6628, 6635, 6642, 6649, 6655, 6656, 6662, 6669, 6676, 6683, 6690, 6696, 6703, 6710, 6717, 6724, 6731, 6737, 6744, 6751, 6758, 6765, 6772, 6778, 6785, 6792, 6799, 6806, 6813, 6819, 6826, 6833, 6840, 6847, 6853, 6860, 6867, 6874, 6881, 6888, 6894, 6901, 6908, 6915, 6922, 6929, 6935, 6942, 6949, 6956, 6963, 6970, 6976, 6983, 6990, 6997, 7004, 7010, 7017, 7024, 7031, 7038, 7045, 7051, 7058, 7065, 7072, 7079, 7086, 7092, 7099, 7106, 7113, 7120, 7127, 7133, 7140, 7147, 7154, 7161, 7167, 7168, 7174, 7181, 7188, 7195, 7202, 7208, 7215, 7222, 7229, 7236, 7243, 7249, 7256, 7263, 7270, 7277, 7284, 7290, 7297, 7304, 7311, 7318, 7325, 7331, 7338, 7345, 7352, 7359, 7365, 7372, 7379, 7386, 7393, 7400, 7406, 7413, 7420, 7427, 7434, 7441, 7447, 7454, 7461, 7468, 7475, 7482, 7488, 7495, 7502, 7509, 7516, 7522, 7529, 7536, 7543, 7550, 7557, 7563, 7570, 7577, 7584, 7591, 7598, 7604, 7611, 7618, 7625, 7632, 7639, 7645, 7652, 7659, 7666, 7673, 7680, 7686, 7693, 7700, 7707, 7714, 7720, 7727, 7734, 7741, 7748, 7755, 7761, 7768, 7775, 7782, 7789, 7796, 7802, 7809, 7816, 7823, 7830, 7837, 7843, 7850, 7857, 7864, 7871, 7877, 7884, 7891, 7898, 7905, 7912, 7918, 7925, 7932, 7939, 7946, 7953, 7959, 7966, 7973, 7980, 7987, 7994, 8000, 8007, 8014, 8021, 8028, 8034, 8041, 8048, 8055, 8062, 8069, 8075, 8082, 8089, 8096, 8103, 8110, 8116, 8123, 8130, 8137, 8144, 8151, 8157, 8164, 8171, 8178, 8185, 8191, 8192, 8205, 8219, 8232, 8246, 8260, 8273, 8287, 8301, 8314, 8328, 8342, 8355, 8369, 8383, 8396, 8410, 8424, 8437, 8451, 8465, 8478, 8492, 8506, 8519, 8533, 8546, 8560, 8574, 8587, 8601, 8615, 8628, 8642, 8656, 8669, 8683, 8697, 8710, 8724, 8738, 8751, 8765, 8779, 8792, 8806, 8820, 8833, 8847, 8861, 8874, 8888, 8901, 8915, 8929, 8942, 8956, 8970, 8983, 8997, 9011, 9024, 9038, 9052, 9065, 9079, 9093, 9106, 9120, 9134, 9147, 9161, 9175, 9188, 9202, 9215, 9216, 9229, 9243, 9256, 9270, 9284, 9297, 9311, 9325, 9338, 9352, 9366, 9379, 9393, 9407, 9420, 9434, 9448, 9461, 9475, 9489, 9502, 9516, 9530, 9543, 9557, 9570, 9584, 9598, 9611, 9625, 9639, 9652, 9666, 9680, 9693, 9707, 9721, 9734, 9748, 9762, 9775, 9789, 9803, 9816, 9830, 9844, 9857, 9871, 9885, 9898, 9912, 9925, 9939, 9953, 9966, 9980, 9994, 10007, 10021, 10035, 10048, 10062, 10076, 10089, 10103, 10117, 10130, 10144, 10158, 10171, 10185, 10199, 10212, 10226, 10239, 10240, 10253, 10267, 10280, 10294, 10308, 10321, 10335, 10349, 10362, 10376, 10390, 10403, 10417, 10431, 10444, 10458, 10472, 10485, 10499, 10513, 10526, 10540, 10554, 10567, 10581, 10594, 10608, 10622, 10635, 10649, 10663, 10676, 10690, 10704, 10717, 10731, 10745, 10758, 10772, 10786, 10799, 10813, 10827, 10840, 10854, 10868, 10881, 10895, 10909, 10922, 10936, 10949, 10963, 10977, 10990, 11004, 11018, 11031, 11045, 11059, 11072, 11086, 11100, 11113, 11127, 11141, 11154, 11168, 11182, 11195, 11209, 11223, 11236, 11250, 11263, 11264, 11277, 11291, 11304, 11318, 11332, 11345, 11359, 11373, 11386, 11400, 11414, 11427, 11441, 11455, 11468, 11482, 11496, 11509, 11523, 11537, 11550, 11564, 11578, 11591, 11605, 11618, 11632, 11646, 11659, 11673, 11687, 11700, 11714, 11728, 11741, 11755, 11769, 11782, 11796, 11810, 11823, 11837, 11851, 11864, 11878, 11892, 11905, 11919, 11933, 11946, 11960, 11973, 11987, 12001, 12014, 12028, 12042, 12055, 12069, 12083, 12096, 12110, 12124, 12137, 12151, 12165, 12178, 12192, 12206, 12219, 12233, 12247, 12260, 12274, 12287, 12288, 12301, 12315, 12328, 12342, 12356, 12369, 12383, 12397, 12410, 12424, 12438, 12451, 12465, 12479, 12492, 12506, 12520, 12533, 12547, 12561, 12574, 12588, 12602, 12615, 12629, 12642, 12656, 12670, 12683, 12697, 12711, 12724, 12738, 12752, 12765, 12779, 12793, 12806, 12820, 12834, 12847, 12861, 12875, 12888, 12902, 12916, 12929, 12943, 12957, 12970, 12984, 12997, 13011, 13025, 13038, 13052, 13066, 13079, 13093, 13107, 13120, 13134, 13148, 13161, 13175, 13189, 13202, 13216, 13230, 13243, 13257, 13271, 13284, 13298, 13311, 13312, 13325, 13339, 13352, 13366, 13380, 13393, 13407, 13421, 13434, 13448, 13462, 13475, 13489, 13503, 13516, 13530, 13544, 13557, 13571, 13585, 13598, 13612, 13626, 13639, 13653, 13666, 13680, 13694, 13707, 13721, 13735, 13748, 13762, 13776, 13789, 13803, 13817, 13830, 13844, 13858, 13871, 13885, 13899, 13912, 13926, 13940, 13953, 13967, 13981, 13994, 14008, 14021, 14035, 14049, 14062, 14076, 14090, 14103, 14117, 14131, 14144, 14158, 14172, 14185, 14199, 14213, 14226, 14240, 14254, 14267, 14281, 14295, 14308, 14322, 14335, 14336, 14349, 14363, 14376, 14390, 14404, 14417, 14431, 14445, 14458, 14472, 14486, 14499, 14513, 14527, 14540, 14554, 14568, 14581, 14595, 14609, 14622, 14636, 14650, 14663, 14677, 14690, 14704, 14718, 14731, 14745, 14759, 14772, 14786, 14800, 14813, 14827, 14841, 14854, 14868, 14882, 14895, 14909, 14923, 14936, 14950, 14964, 14977, 14991, 15005, 15018, 15032, 15045, 15059, 15073, 15086, 15100, 15114, 15127, 15141, 15155, 15168, 15182, 15196, 15209, 15223, 15237, 15250, 15264, 15278, 15291, 15305, 15319, 15332, 15346, 15360, 15373, 15387, 15400, 15414, 15428, 15441, 15455, 15469, 15482, 15496, 15510, 15523, 15537, 15551, 15564, 15578, 15592, 15605, 15619, 15633, 15646, 15660, 15674, 15687, 15701, 15714, 15728, 15742, 15755, 15769, 15783, 15796, 15810, 15824, 15837, 15851, 15865, 15878, 15892, 15906, 15919, 15933, 15947, 15960, 15974, 15988, 16001, 16015, 16029, 16042, 16056, 16069, 16083, 16097, 16110, 16124, 16138, 16151, 16165, 16179, 16192, 16206, 16220, 16233, 16247, 16261, 16274, 16288, 16302, 16315, 16329, 16343, 16356, 16370, 16383, 16384, 16411, 16438, 16465, 16493, 16520, 16547, 16575, 16602, 16629, 16657, 16684, 16711, 16738, 16766, 16793, 16820, 16848, 16875, 16902, 16930, 16957, 16984, 17012, 17039, 17066, 17093, 17121, 17148, 17175, 17203, 17230, 17257, 17285, 17312, 17339, 17367, 17394, 17421, 17448, 17476, 17503, 17530, 17558, 17585, 17612, 17640, 17667, 17694, 17722, 17749, 17776, 17803, 17831, 17858, 17885, 17913, 17940, 17967, 17995, 18022, 18049, 18077, 18104, 18131, 18158, 18186, 18213, 18240, 18268, 18295, 18322, 18350, 18377, 18404, 18431, 18432, 18459, 18486, 18513, 18541, 18568, 18595, 18623, 18650, 18677, 18705, 18732, 18759, 18786, 18814, 18841, 18868, 18896, 18923, 18950, 18978, 19005, 19032, 19060, 19087, 19114, 19141, 19169, 19196, 19223, 19251, 19278, 19305, 19333, 19360, 19387, 19415, 19442, 19469, 19496, 19524, 19551, 19578, 19606, 19633, 19660, 19688, 19715, 19742, 19770, 19797, 19824, 19851, 19879, 19906, 19933, 19961, 19988, 20015, 20043, 20070, 20097, 20125, 20152, 20179, 20206, 20234, 20261, 20288, 20316, 20343, 20370, 20398, 20425, 20452, 20479, 20480, 20507, 20534, 20561, 20589, 20616, 20643, 20671, 20698, 20725, 20753, 20780, 20807, 20834, 20862, 20889, 20916, 20944, 20971, 20998, 21026, 21053, 21080, 21108, 21135, 21162, 21189, 21217, 21244, 21271, 21299, 21326, 21353, 21381, 21408, 21435, 21463, 21490, 21517, 21544, 21572, 21599, 21626, 21654, 21681, 21708, 21736, 21763, 21790, 21818, 21845, 21872, 21899, 21927, 21954, 21981, 22009, 22036, 22063, 22091, 22118, 22145, 22173, 22200, 22227, 22254, 22282, 22309, 22336, 22364, 22391, 22418, 22446, 22473, 22500, 22527, 22528, 22555, 22582, 22609, 22637, 22664, 22691, 22719, 22746, 22773, 22801, 22828, 22855, 22882, 22910, 22937, 22964, 22992, 23019, 23046, 23074, 23101, 23128, 23156, 23183, 23210, 23237, 23265, 23292, 23319, 23347, 23374, 23401, 23429, 23456, 23483, 23511, 23538, 23565, 23592, 23620, 23647, 23674, 23702, 23729, 23756, 23784, 23811, 23838, 23866, 23893, 23920, 23947, 23975, 24002, 24029, 24057, 24084, 24111, 24139, 24166, 24193, 24221, 24248, 24275, 24302, 24330, 24357, 24384, 24412, 24439, 24466, 24494, 24521, 24548, 24575, 24576, 24603, 24630, 24657, 24685, 24712, 24739, 24767, 24794, 24821, 24849, 24876, 24903, 24930, 24958, 24985, 25012, 25040, 25067, 25094, 25122, 25149, 25176, 25204, 25231, 25258, 25285, 25313, 25340, 25367, 25395, 25422, 25449, 25477, 25504, 25531, 25559, 25586, 25613, 25640, 25668, 25695, 25722, 25750, 25777, 25804, 25832, 25859, 25886, 25914, 25941, 25968, 25995, 26023, 26050, 26077, 26105, 26132, 26159, 26187, 26214, 26241, 26269, 26296, 26323, 26350, 26378, 26405, 26432, 26460, 26487, 26514, 26542, 26569, 26596, 26623, 26624, 26651, 26678, 26705, 26733, 26760, 26787, 26815, 26842, 26869, 26897, 26924, 26951, 26978, 27006, 27033, 27060, 27088, 27115, 27142, 27170, 27197, 27224, 27252, 27279, 27306, 27333, 27361, 27388, 27415, 27443, 27470, 27497, 27525, 27552, 27579, 27607, 27634, 27661, 27688, 27716, 27743, 27770, 27798, 27825, 27852, 27880, 27907, 27934, 27962, 27989, 28016, 28043, 28071, 28098, 28125, 28153, 28180, 28207, 28235, 28262, 28289, 28317, 28344, 28371, 28398, 28426, 28453, 28480, 28508, 28535, 28562, 28590, 28617, 28644, 28671, 28672, 28699, 28726, 28753, 28781, 28808, 28835, 28863, 28890, 28917, 28945, 28972, 28999, 29026, 29054, 29081, 29108, 29136, 29163, 29190, 29218, 29245, 29272, 29300, 29327, 29354, 29381, 29409, 29436, 29463, 29491, 29518, 29545, 29573, 29600, 29627, 29655, 29682, 29709, 29736, 29764, 29791, 29818, 29846, 29873, 29900, 29928, 29955, 29982, 30010, 30037, 30064, 30091, 30119, 30146, 30173, 30201, 30228, 30255, 30283, 30310, 30337, 30365, 30392, 30419, 30446, 30474, 30501, 30528, 30556, 30583, 30610, 30638, 30665, 30692, 30720, 30747, 30774, 30801, 30829, 30856, 30883, 30911, 30938, 30965, 30993, 31020, 31047, 31074, 31102, 31129, 31156, 31184, 31211, 31238, 31266, 31293, 31320, 31348, 31375, 31402, 31429, 31457, 31484, 31511, 31539, 31566, 31593, 31621, 31648, 31675, 31703, 31730, 31757, 31784, 31812, 31839, 31866, 31894, 31921, 31948, 31976, 32003, 32030, 32058, 32085, 32112, 32139, 32167, 32194, 32221, 32249, 32276, 32303, 32331, 32358, 32385, 32413, 32440, 32467, 32494, 32522, 32549, 32576, 32604, 32631, 32658, 32686, 32713, 32740, 32767, 32768, 32822, 32877, 32931, 32986, 33041, 33095, 33150, 33204, 33259, 33314, 33368, 33423, 33477, 33532, 33587, 33641, 33696, 33751, 33805, 33860, 33914, 33969, 34024, 34078, 34133, 34187, 34242, 34297, 34351, 34406, 34461, 34515, 34570, 34624, 34679, 34734, 34788, 34843, 34897, 34952, 35007, 35061, 35116, 35170, 35225, 35280, 35334, 35389, 35444, 35498, 35553, 35607, 35662, 35717, 35771, 35826, 35880, 35935, 35990, 36044, 36099, 36154, 36208, 36263, 36317, 36372, 36427, 36481, 36536, 36590, 36645, 36700, 36754, 36809, 36863, 36864, 36918, 36973, 37027, 37082, 37137, 37191, 37246, 37300, 37355, 37410, 37464, 37519, 37573, 37628, 37683, 37737, 37792, 37847, 37901, 37956, 38010, 38065, 38120, 38174, 38229, 38283, 38338, 38393, 38447, 38502, 38557, 38611, 38666, 38720, 38775, 38830, 38884, 38939, 38993, 39048, 39103, 39157, 39212, 39266, 39321, 39376, 39430, 39485, 39540, 39594, 39649, 39703, 39758, 39813, 39867, 39922, 39976, 40031, 40086, 40140, 40195, 40250, 40304, 40359, 40413, 40468, 40523, 40577, 40632, 40686, 40741, 40796, 40850, 40905, 40959, 40960, 41014, 41069, 41123, 41178, 41233, 41287, 41342, 41396, 41451, 41506, 41560, 41615, 41669, 41724, 41779, 41833, 41888, 41943, 41997, 42052, 42106, 42161, 42216, 42270, 42325, 42379, 42434, 42489, 42543, 42598, 42653, 42707, 42762, 42816, 42871, 42926, 42980, 43035, 43089, 43144, 43199, 43253, 43308, 43362, 43417, 43472, 43526, 43581, 43636, 43690, 43745, 43799, 43854, 43909, 43963, 44018, 44072, 44127, 44182, 44236, 44291, 44346, 44400, 44455, 44509, 44564, 44619, 44673, 44728, 44782, 44837, 44892, 44946, 45001, 45055, 45056, 45110, 45165, 45219, 45274, 45329, 45383, 45438, 45492, 45547, 45602, 45656, 45711, 45765, 45820, 45875, 45929, 45984, 46039, 46093, 46148, 46202, 46257, 46312, 46366, 46421, 46475, 46530, 46585, 46639, 46694, 46749, 46803, 46858, 46912, 46967, 47022, 47076, 47131, 47185, 47240, 47295, 47349, 47404, 47458, 47513, 47568, 47622, 47677, 47732, 47786, 47841, 47895, 47950, 48005, 48059, 48114, 48168, 48223, 48278, 48332, 48387, 48442, 48496, 48551, 48605, 48660, 48715, 48769, 48824, 48878, 48933, 48988, 49042, 49097, 49151, 49152, 49206, 49261, 49315, 49370, 49425, 49479, 49534, 49588, 49643, 49698, 49752, 49807, 49861, 49916, 49971, 50025, 50080, 50135, 50189, 50244, 50298, 50353, 50408, 50462, 50517, 50571, 50626, 50681, 50735, 50790, 50845, 50899, 50954, 51008, 51063, 51118, 51172, 51227, 51281, 51336, 51391, 51445, 51500, 51554, 51609, 51664, 51718, 51773, 51828, 51882, 51937, 51991, 52046, 52101, 52155, 52210, 52264, 52319, 52374, 52428, 52483, 52538, 52592, 52647, 52701, 52756, 52811, 52865, 52920, 52974, 53029, 53084, 53138, 53193, 53247, 53248, 53302, 53357, 53411, 53466, 53521, 53575, 53630, 53684, 53739, 53794, 53848, 53903, 53957, 54012, 54067, 54121, 54176, 54231, 54285, 54340, 54394, 54449, 54504, 54558, 54613, 54667, 54722, 54777, 54831, 54886, 54941, 54995, 55050, 55104, 55159, 55214, 55268, 55323, 55377, 55432, 55487, 55541, 55596, 55650, 55705, 55760, 55814, 55869, 55924, 55978, 56033, 56087, 56142, 56197, 56251, 56306, 56360, 56415, 56470, 56524, 56579, 56634, 56688, 56743, 56797, 56852, 56907, 56961, 57016, 57070, 57125, 57180, 57234, 57289, 57343, 57344, 57398, 57453, 57507, 57562, 57617, 57671, 57726, 57780, 57835, 57890, 57944, 57999, 58053, 58108, 58163, 58217, 58272, 58327, 58381, 58436, 58490, 58545, 58600, 58654, 58709, 58763, 58818, 58873, 58927, 58982, 59037, 59091, 59146, 59200, 59255, 59310, 59364, 59419, 59473, 59528, 59583, 59637, 59692, 59746, 59801, 59856, 59910, 59965, 60020, 60074, 60129, 60183, 60238, 60293, 60347, 60402, 60456, 60511, 60566, 60620, 60675, 60730, 60784, 60839, 60893, 60948, 61003, 61057, 61112, 61166, 61221, 61276, 61330, 61385, 61440, 61494, 61549, 61603, 61658, 61713, 61767, 61822, 61876, 61931, 61986, 62040, 62095, 62149, 62204, 62259, 62313, 62368, 62423, 62477, 62532, 62586, 62641, 62696, 62750, 62805, 62859, 62914, 62969, 63023, 63078, 63133, 63187, 63242, 63296, 63351, 63406, 63460, 63515, 63569, 63624, 63679, 63733, 63788, 63842, 63897, 63952, 64006, 64061, 64116, 64170, 64225, 64279, 64334, 64389, 64443, 64498, 64552, 64607, 64662, 64716, 64771, 64826, 64880, 64935, 64989, 65044, 65099, 65153, 65208, 65262, 65317, 65372, 65426, 65481, 65535, 65536, 65645, 65754, 65863, 65972, 66082, 66191, 66300, 66409, 66519, 66628, 66737, 66846, 66955, 67065, 67174, 67283, 67392, 67502, 67611, 67720, 67829, 67938, 68048, 68157, 68266, 68375, 68485, 68594, 68703, 68812, 68922, 69031, 69140, 69249, 69358, 69468, 69577, 69686, 69795, 69905, 70014, 70123, 70232, 70341, 70451, 70560, 70669, 70778, 70888, 70997, 71106, 71215, 71325, 71434, 71543, 71652, 71761, 71871, 71980, 72089, 72198, 72308, 72417, 72526, 72635, 72744, 72854, 72963, 73072, 73181, 73291, 73400, 73509, 73618, 73727, 73728, 73837, 73946, 74055, 74164, 74274, 74383, 74492, 74601, 74711, 74820, 74929, 75038, 75147, 75257, 75366, 75475, 75584, 75694, 75803, 75912, 76021, 76130, 76240, 76349, 76458, 76567, 76677, 76786, 76895, 77004, 77114, 77223, 77332, 77441, 77550, 77660, 77769, 77878, 77987, 78097, 78206, 78315, 78424, 78533, 78643, 78752, 78861, 78970, 79080, 79189, 79298, 79407, 79517, 79626, 79735, 79844, 79953, 80063, 80172, 80281, 80390, 80500, 80609, 80718, 80827, 80936, 81046, 81155, 81264, 81373, 81483, 81592, 81701, 81810, 81919, 81920, 82029, 82138, 82247, 82356, 82466, 82575, 82684, 82793, 82903, 83012, 83121, 83230, 83339, 83449, 83558, 83667, 83776, 83886, 83995, 84104, 84213, 84322, 84432, 84541, 84650, 84759, 84869, 84978, 85087, 85196, 85306, 85415, 85524, 85633, 85742, 85852, 85961, 86070, 86179, 86289, 86398, 86507, 86616, 86725, 86835, 86944, 87053, 87162, 87272, 87381, 87490, 87599, 87709, 87818, 87927, 88036, 88145, 88255, 88364, 88473, 88582, 88692, 88801, 88910, 89019, 89128, 89238, 89347, 89456, 89565, 89675, 89784, 89893, 90002, 90111, 90112, 90221, 90330, 90439, 90548, 90658, 90767, 90876, 90985, 91095, 91204, 91313, 91422, 91531, 91641, 91750, 91859, 91968, 92078, 92187, 92296, 92405, 92514, 92624, 92733, 92842, 92951, 93061, 93170, 93279, 93388, 93498, 93607, 93716, 93825, 93934, 94044, 94153, 94262, 94371, 94481, 94590, 94699, 94808, 94917, 95027, 95136, 95245, 95354, 95464, 95573, 95682, 95791, 95901, 96010, 96119, 96228, 96337, 96447, 96556, 96665, 96774, 96884, 96993, 97102, 97211, 97320, 97430, 97539, 97648, 97757, 97867, 97976, 98085, 98194, 98303, 98304, 98413, 98522, 98631, 98740, 98850, 98959, 99068, 99177, 99287, 99396, 99505, 99614, 99723, 99833, 99942, 100051, 100160, 100270, 100379, 100488, 100597, 100706, 100816, 100925, 101034, 101143, 101253, 101362, 101471, 101580, 101690, 101799, 101908, 102017, 102126, 102236, 102345, 102454, 102563, 102673, 102782, 102891, 103000, 103109, 103219, 103328, 103437, 103546, 103656, 103765, 103874, 103983, 104093, 104202, 104311, 104420, 104529, 104639, 104748, 104857, 104966, 105076, 105185, 105294, 105403, 105512, 105622, 105731, 105840, 105949, 106059, 106168, 106277, 106386, 106495, 106496, 106605, 106714, 106823, 106932, 107042, 107151, 107260, 107369, 107479, 107588, 107697, 107806, 107915, 108025, 108134, 108243, 108352, 108462, 108571, 108680, 108789, 108898, 109008, 109117, 109226, 109335, 109445, 109554, 109663, 109772, 109882, 109991, 110100, 110209, 110318, 110428, 110537, 110646, 110755, 110865, 110974, 111083, 111192, 111301, 111411, 111520, 111629, 111738, 111848, 111957, 112066, 112175, 112285, 112394, 112503, 112612, 112721, 112831, 112940, 113049, 113158, 113268, 113377, 113486, 113595, 113704, 113814, 113923, 114032, 114141, 114251, 114360, 114469, 114578, 114687, 114688, 114797, 114906, 115015, 115124, 115234, 115343, 115452, 115561, 115671, 115780, 115889, 115998, 116107, 116217, 116326, 116435, 116544, 116654, 116763, 116872, 116981, 117090, 117200, 117309, 117418, 117527, 117637, 117746, 117855, 117964, 118074, 118183, 118292, 118401, 118510, 118620, 118729, 118838, 118947, 119057, 119166, 119275, 119384, 119493, 119603, 119712, 119821, 119930, 120040, 120149, 120258, 120367, 120477, 120586, 120695, 120804, 120913, 121023, 121132, 121241, 121350, 121460, 121569, 121678, 121787, 121896, 122006, 122115, 122224, 122333, 122443, 122552, 122661, 122770, 122880, 122989, 123098, 123207, 123316, 123426, 123535, 123644, 123753, 123863, 123972, 124081, 124190, 124299, 124409, 124518, 124627, 124736, 124846, 124955, 125064, 125173, 125282, 125392, 125501, 125610, 125719, 125829, 125938, 126047, 126156, 126266, 126375, 126484, 126593, 126702, 126812, 126921, 127030, 127139, 127249, 127358, 127467, 127576, 127685, 127795, 127904, 128013, 128122, 128232, 128341, 128450, 128559, 128669, 128778, 128887, 128996, 129105, 129215, 129324, 129433, 129542, 129652, 129761, 129870, 129979, 130088, 130198, 130307, 130416, 130525, 130635, 130744, 130853, 130962, 131071, 131072, 131290, 131508, 131727, 131945, 132164, 132382, 132601, 132819, 133038, 133256, 133474, 133475, 133693, 133911, 134130, 134348, 134567, 134785, 135004, 135222, 135441, 135659, 135877, 136096, 136314, 136533, 136751, 136970, 137188, 137407, 137625, 137844, 138062, 138280, 138499, 138717, 138936, 139154, 139373, 139591, 139810, 140028, 140247, 140465, 140683, 140902, 141120, 141339, 141557, 141776, 141994, 142213, 142431, 142650, 142868, 143086, 143305, 143523, 143742, 143960, 144179, 144397, 144616, 144834, 145053, 145271, 145489, 145708, 145926, 146145, 146363, 146582, 146800, 147019, 147237, 147455, 147456, 147674, 147892, 148111, 148329, 148548, 148766, 148985, 149203, 149422, 149640, 149858, 149859, 150077, 150295, 150514, 150732, 150951, 151169, 151388, 151606, 151825, 152043, 152261, 152480, 152698, 152917, 153135, 153354, 153572, 153791, 154009, 154228, 154446, 154664, 154883, 155101, 155320, 155538, 155757, 155975, 156194, 156412, 156631, 156849, 157067, 157286, 157504, 157723, 157941, 158160, 158378, 158597, 158815, 159034, 159252, 159470, 159689, 159907, 160126, 160344, 160563, 160781, 161000, 161218, 161437, 161655, 161873, 162092, 162310, 162529, 162747, 162966, 163184, 163403, 163621, 163839, 163840, 164058, 164276, 164495, 164713, 164932, 165150, 165369, 165587, 165806, 166024, 166242, 166243, 166461, 166679, 166898, 167116, 167335, 167553, 167772, 167990, 168209, 168427, 168645, 168864, 169082, 169301, 169519, 169738, 169956, 170175, 170393, 170612, 170830, 171048, 171267, 171485, 171704, 171922, 172141, 172359, 172578, 172796, 173015, 173233, 173451, 173670, 173888, 174107, 174325, 174544, 174762, 174981, 175199, 175418, 175636, 175854, 176073, 176291, 176510, 176728, 176947, 177165, 177384, 177602, 177821, 178039, 178257, 178476, 178694, 178913, 179131, 179350, 179568, 179787, 180005, 180223, 180224, 180442, 180660, 180879, 181097, 181316, 181534, 181753, 181971, 182190, 182408, 182626, 182627, 182845, 183063, 183282, 183500, 183719, 183937, 184156, 184374, 184593, 184811, 185029, 185248, 185466, 185685, 185903, 186122, 186340, 186559, 186777, 186996, 187214, 187432, 187651, 187869, 188088, 188306, 188525, 188743, 188962, 189180, 189399, 189617, 189835, 190054, 190272, 190491, 190709, 190928, 191146, 191365, 191583, 191802, 192020, 192238, 192457, 192675, 192894, 193112, 193331, 193549, 193768, 193986, 194205, 194423, 194641, 194860, 195078, 195297, 195515, 195734, 195952, 196171, 196389, 196607, 196608, 196826, 197044, 197263, 197481, 197700, 197918, 198137, 198355, 198574, 198792, 199010, 199011, 199229, 199447, 199666, 199884, 200103, 200321, 200540, 200758, 200977, 201195, 201413, 201632, 201850, 202069, 202287, 202506, 202724, 202943, 203161, 203380, 203598, 203816, 204035, 204253, 204472, 204690, 204909, 205127, 205346, 205564, 205783, 206001, 206219, 206438, 206656, 206875, 207093, 207312, 207530, 207749, 207967, 208186, 208404, 208622, 208841, 209059, 209278, 209496, 209715, 209933, 210152, 210370, 210589, 210807, 211025, 211244, 211462, 211681, 211899, 212118, 212336, 212555, 212773, 212991, 212992, 213210, 213428, 213647, 213865, 214084, 214302, 214521, 214739, 214958, 215176, 215394, 215395, 215613, 215831, 216050, 216268, 216487, 216705, 216924, 217142, 217361, 217579, 217797, 218016, 218234, 218453, 218671, 218890, 219108, 219327, 219545, 219764, 219982, 220200, 220419, 220637, 220856, 221074, 221293, 221511, 221730, 221948, 222167, 222385, 222603, 222822, 223040, 223259, 223477, 223696, 223914, 224133, 224351, 224570, 224788, 225006, 225225, 225443, 225662, 225880, 226099, 226317, 226536, 226754, 226973, 227191, 227409, 227628, 227846, 228065, 228283, 228502, 228720, 228939, 229157, 229375, 229376, 229594, 229812, 230031, 230249, 230468, 230686, 230905, 231123, 231342, 231560, 231778, 231779, 231997, 232215, 232434, 232652, 232871, 233089, 233308, 233526, 233745, 233963, 234181, 234400, 234618, 234837, 235055, 235274, 235492, 235711, 235929, 236148, 236366, 236584, 236803, 237021, 237240, 237458, 237677, 237895, 238114, 238332, 238551, 238769, 238987, 239206, 239424, 239643, 239861, 240080, 240298, 240517, 240735, 240954, 241172, 241390, 241609, 241827, 242046, 242264, 242483, 242701, 242920, 243138, 243357, 243575, 243793, 244012, 244230, 244449, 244667, 244886, 245104, 245323, 245541, 245760, 245978, 246196, 246415, 246633, 246852, 247070, 247289, 247507, 247726, 247944, 248162, 248163, 248381, 248599, 248818, 249036, 249255, 249473, 249692, 249910, 250129, 250347, 250565, 250784, 251002, 251221, 251439, 251658, 251876, 252095, 252313, 252532, 252750, 252968, 253187, 253405, 253624, 253842, 254061, 254279, 254498, 254716, 254935, 255153, 255371, 255590, 255808, 256027, 256245, 256464, 256682, 256901, 257119, 257338, 257556, 257774, 257993, 258211, 258430, 258648, 258867, 259085, 259304, 259522, 259741, 259959, 260177, 260396, 260614, 260833, 261051, 261270, 261488, 261707, 261925, 262143, 262144, 262580, 263017, 263454, 263891, 264328, 264765, 265202, 265639, 266076, 266513, 266949, 266950, 267386, 267823, 268260, 268697, 269134, 269571, 270008, 270445, 270882, 271319, 271755, 272192, 272629, 273066, 273503, 273940, 274377, 274814, 275251, 275688, 276125, 276561, 276998, 277435, 277872, 278309, 278746, 279183, 279620, 280057, 280494, 280930, 280931, 281367, 281804, 282241, 282678, 283115, 283552, 283989, 284426, 284863, 285300, 285736, 286173, 286610, 287047, 287484, 287921, 288358, 288795, 289232, 289669, 290106, 290542, 290979, 291416, 291853, 292290, 292727, 293164, 293601, 294038, 294475, 294911, 294912, 295348, 295785, 296222, 296659, 297096, 297533, 297970, 298407, 298844, 299281, 299717, 299718, 300154, 300591, 301028, 301465, 301902, 302339, 302776, 303213, 303650, 304087, 304523, 304960, 305397, 305834, 306271, 306708, 307145, 307582, 308019, 308456, 308893, 309329, 309766, 310203, 310640, 311077, 311514, 311951, 312388, 312825, 313262, 313698, 313699, 314135, 314572, 315009, 315446, 315883, 316320, 316757, 317194, 317631, 318068, 318504, 318941, 319378, 319815, 320252, 320689, 321126, 321563, 322000, 322437, 322874, 323310, 323747, 324184, 324621, 325058, 325495, 325932, 326369, 326806, 327243, 327679, 327680, 328116, 328553, 328990, 329427, 329864, 330301, 330738, 331175, 331612, 332049, 332485, 332486, 332922, 333359, 333796, 334233, 334670, 335107, 335544, 335981, 336418, 336855, 337291, 337728, 338165, 338602, 339039, 339476, 339913, 340350, 340787, 341224, 341661, 342097, 342534, 342971, 343408, 343845, 344282, 344719, 345156, 345593, 346030, 346466, 346467, 346903, 347340, 347777, 348214, 348651, 349088, 349525, 349962, 350399, 350836, 351272, 351709, 352146, 352583, 353020, 353457, 353894, 354331, 354768, 355205, 355642, 356078, 356515, 356952, 357389, 357826, 358263, 358700, 359137, 359574, 360011, 360447, 360448, 360884, 361321, 361758, 362195, 362632, 363069, 363506, 363943, 364380, 364817, 365253, 365254, 365690, 366127, 366564, 367001, 367438, 367875, 368312, 368749, 369186, 369623, 370059, 370496, 370933, 371370, 371807, 372244, 372681, 373118, 373555, 373992, 374429, 374865, 375302, 375739, 376176, 376613, 377050, 377487, 377924, 378361, 378798, 379234, 379235, 379671, 380108, 380545, 380982, 381419, 381856, 382293, 382730, 383167, 383604, 384040, 384477, 384914, 385351, 385788, 386225, 386662, 387099, 387536, 387973, 388410, 388846, 389283, 389720, 390157, 390594, 391031, 391468, 391905, 392342, 392779, 393215, 393216, 393652, 394089, 394526, 394963, 395400, 395837, 396274, 396711, 397148, 397585, 398021, 398022, 398458, 398895, 399332, 399769, 400206, 400643, 401080, 401517, 401954, 402391, 402827, 403264, 403701, 404138, 404575, 405012, 405449, 405886, 406323, 406760, 407197, 407633, 408070, 408507, 408944, 409381, 409818, 410255, 410692, 411129, 411566, 412002, 412003, 412439, 412876, 413313, 413750, 414187, 414624, 415061, 415498, 415935, 416372, 416808, 417245, 417682, 418119, 418556, 418993, 419430, 419867, 420304, 420741, 421178, 421614, 422051, 422488, 422925, 423362, 423799, 424236, 424673, 425110, 425547, 425983, 425984, 426420, 426857, 427294, 427731, 428168, 428605, 429042, 429479, 429916, 430353, 430789, 430790, 431226, 431663, 432100, 432537, 432974, 433411, 433848, 434285, 434722, 435159, 435595, 436032, 436469, 436906, 437343, 437780, 438217, 438654, 439091, 439528, 439965, 440401, 440838, 441275, 441712, 442149, 442586, 443023, 443460, 443897, 444334, 444770, 444771, 445207, 445644, 446081, 446518, 446955, 447392, 447829, 448266, 448703, 449140, 449576, 450013, 450450, 450887, 451324, 451761, 452198, 452635, 453072, 453509, 453946, 454382, 454819, 455256, 455693, 456130, 456567, 457004, 457441, 457878, 458315, 458751, 458752, 459188, 459625, 460062, 460499, 460936, 461373, 461810, 462247, 462684, 463121, 463557, 463558, 463994, 464431, 464868, 465305, 465742, 466179, 466616, 467053, 467490, 467927, 468363, 468800, 469237, 469674, 470111, 470548, 470985, 471422, 471859, 472296, 472733, 473169, 473606, 474043, 474480, 474917, 475354, 475791, 476228, 476665, 477102, 477538, 477539, 477975, 478412, 478849, 479286, 479723, 480160, 480597, 481034, 481471, 481908, 482344, 482781, 483218, 483655, 484092, 484529, 484966, 485403, 485840, 486277, 486714, 487150, 487587, 488024, 488461, 488898, 489335, 489772, 490209, 490646, 491083, 491520, 491956, 492393, 492830, 493267, 493704, 494141, 494578, 495015, 495452, 495889, 496325, 496326, 496762, 497199, 497636, 498073, 498510, 498947, 499384, 499821, 500258, 500695, 501131, 501568, 502005, 502442, 502879, 503316, 503753, 504190, 504627, 505064, 505501, 505937, 506374, 506811, 507248, 507685, 508122, 508559, 508996, 509433, 509870, 510306, 510307, 510743, 511180, 511617, 512054, 512491, 512928, 513365, 513802, 514239, 514676, 515112, 515549, 515986, 516423, 516860, 517297, 517734, 518171, 518608, 519045, 519482, 519918, 520355, 520792, 521229, 521666, 522103, 522540, 522977, 523414, 523851, 524287, 524288, 525161, 526035, 526909, 527783, 528657, 529530, 530404, 531278, 532152, 533026, 533899, 533900, 534773, 535647, 536521, 537395, 538269, 539142, 540016, 540890, 541764, 542638, 543511, 544385, 545259, 546133, 547007, 547880, 547881, 548754, 549628, 550502, 551376, 552250, 553123, 553997, 554871, 555745, 556619, 557492, 558366, 559240, 560114, 560988, 561861, 561862, 562735, 563609, 564483, 565357, 566231, 567104, 567978, 568852, 569726, 570600, 571473, 572347, 573221, 574095, 574969, 575842, 575843, 576716, 577590, 578464, 579338, 580212, 581085, 581959, 582833, 583707, 584581, 585454, 586328, 587202, 588076, 588950, 589823, 589824, 590697, 591571, 592445, 593319, 594193, 595066, 595940, 596814, 597688, 598562, 599435, 599436, 600309, 601183, 602057, 602931, 603805, 604678, 605552, 606426, 607300, 608174, 609047, 609921, 610795, 611669, 612543, 613416, 613417, 614290, 615164, 616038, 616912, 617786, 618659, 619533, 620407, 621281, 622155, 623028, 623902, 624776, 625650, 626524, 627397, 627398, 628271, 629145, 630019, 630893, 631767, 632640, 633514, 634388, 635262, 636136, 637009, 637883, 638757, 639631, 640505, 641378, 641379, 642252, 643126, 644000, 644874, 645748, 646621, 647495, 648369, 649243, 650117, 650990, 651864, 652738, 653612, 654486, 655359, 655360, 656233, 657107, 657981, 658855, 659729, 660602, 661476, 662350, 663224, 664098, 664971, 664972, 665845, 666719, 667593, 668467, 669341, 670214, 671088, 671962, 672836, 673710, 674583, 675457, 676331, 677205, 678079, 678952, 678953, 679826, 680700, 681574, 682448, 683322, 684195, 685069, 685943, 686817, 687691, 688564, 689438, 690312, 691186, 692060, 692933, 692934, 693807, 694681, 695555, 696429, 697303, 698176, 699050, 699924, 700798, 701672, 702545, 703419, 704293, 705167, 706041, 706914, 706915, 707788, 708662, 709536, 710410, 711284, 712157, 713031, 713905, 714779, 715653, 716526, 717400, 718274, 719148, 720022, 720895, 720896, 721769, 722643, 723517, 724391, 725265, 726138, 727012, 727886, 728760, 729634, 730507, 730508, 731381, 732255, 733129, 734003, 734877, 735750, 736624, 737498, 738372, 739246, 740119, 740993, 741867, 742741, 743615, 744488, 744489, 745362, 746236, 747110, 747984, 748858, 749731, 750605, 751479, 752353, 753227, 754100, 754974, 755848, 756722, 757596, 758469, 758470, 759343, 760217, 761091, 761965, 762839, 763712, 764586, 765460, 766334, 767208, 768081, 768955, 769829, 770703, 771577, 772450, 772451, 773324, 774198, 775072, 775946, 776820, 777693, 778567, 779441, 780315, 781189, 782062, 782936, 783810, 784684, 785558, 786431, 786432, 787305, 788179, 789053, 789927, 790801, 791674, 792548, 793422, 794296, 795170, 796043, 796044, 796917, 797791, 798665, 799539, 800413, 801286, 802160, 803034, 803908, 804782, 805655, 806529, 807403, 808277, 809151, 810024, 810025, 810898, 811772, 812646, 813520, 814394, 815267, 816141, 817015, 817889, 818763, 819636, 820510, 821384, 822258, 823132, 824005, 824006, 824879, 825753, 826627, 827501, 828375, 829248, 830122, 830996, 831870, 832744, 833617, 834491, 835365, 836239, 837113, 837986, 837987, 838860, 839734, 840608, 841482, 842356, 843229, 844103, 844977, 845851, 846725, 847598, 848472, 849346, 850220, 851094, 851967, 851968, 852841, 853715, 854589, 855463, 856337, 857210, 858084, 858958, 859832, 860706, 861579, 861580, 862453, 863327, 864201, 865075, 865949, 866822, 867696, 868570, 869444, 870318, 871191, 872065, 872939, 873813, 874687, 875560, 875561, 876434, 877308, 878182, 879056, 879930, 880803, 881677, 882551, 883425, 884299, 885172, 886046, 886920, 887794, 888668, 889541, 889542, 890415, 891289, 892163, 893037, 893911, 894784, 895658, 896532, 897406, 898280, 899153, 900027, 900901, 901775, 902649, 903522, 903523, 904396, 905270, 906144, 907018, 907892, 908765, 909639, 910513, 911387, 912261, 913134, 914008, 914882, 915756, 916630, 917503, 917504, 918377, 919251, 920125, 920999, 921873, 922746, 923620, 924494, 925368, 926242, 927115, 927116, 927989, 928863, 929737, 930611, 931485, 932358, 933232, 934106, 934980, 935854, 936727, 937601, 938475, 939349, 940223, 941096, 941097, 941970, 942844, 943718, 944592, 945466, 946339, 947213, 948087, 948961, 949835, 950708, 951582, 952456, 953330, 954204, 955077, 955078, 955951, 956825, 957699, 958573, 959447, 960320, 961194, 962068, 962942, 963816, 964689, 965563, 966437, 967311, 968185, 969058, 969059, 969932, 970806, 971680, 972554, 973428, 974301, 975175, 976049, 976923, 977797, 978670, 979544, 980418, 981292, 982166, 983040, 983913, 984787, 985661, 986535, 987409, 988282, 989156, 990030, 990904, 991778, 992651, 992652, 993525, 994399, 995273, 996147, 997021, 997894, 998768, 999642, 1000516, 1001390, 1002263, 1003137, 1004011, 1004885, 1005759, 1006632, 1006633, 1007506, 1008380, 1009254, 1010128, 1011002, 1011875, 1012749, 1013623, 1014497, 1015371, 1016244, 1017118, 1017992, 1018866, 1019740, 1020613, 1020614, 1021487, 1022361, 1023235, 1024109, 1024983, 1025856, 1026730, 1027604, 1028478, 1029352, 1030225, 1031099, 1031973, 1032847, 1033721, 1034594, 1034595, 1035468, 1036342, 1037216, 1038090, 1038964, 1039837, 1040711, 1041585, 1042459, 1043333, 1044206, 1045080, 1045954, 1046828, 1047702, 1048575, 1048576, 1050323, 1052071, 1053818, 1053819, 1055566, 1057314, 1059061, 1060809, 1062557, 1064304, 1066052, 1067799, 1067800, 1069547, 1071295, 1073042, 1074790, 1076538, 1078285, 1080033, 1081780, 1081781, 1083528, 1085276, 1087023, 1088771, 1090519, 1092266, 1094014, 1095761, 1095762, 1097509, 1099257, 1101004, 1102752, 1104500, 1106247, 1107995, 1109742, 1109743, 1111490, 1113238, 1114985, 1116733, 1118481, 1120228, 1121976, 1123723, 1123724, 1125471, 1127219, 1128966, 1130714, 1132462, 1134209, 1135957, 1137704, 1137705, 1139452, 1141200, 1142947, 1144695, 1146443, 1148190, 1149938, 1151685, 1151686, 1153433, 1155181, 1156928, 1158676, 1160424, 1162171, 1163919, 1165666, 1165667, 1167414, 1169162, 1170909, 1172657, 1174405, 1176152, 1177900, 1179647, 1179648, 1181395, 1183143, 1184890, 1184891, 1186638, 1188386, 1190133, 1191881, 1193629, 1195376, 1197124, 1198871, 1198872, 1200619, 1202367, 1204114, 1205862, 1207610, 1209357, 1211105, 1212852, 1212853, 1214600, 1216348, 1218095, 1219843, 1221591, 1223338, 1225086, 1226833, 1226834, 1228581, 1230329, 1232076, 1233824, 1235572, 1237319, 1239067, 1240814, 1240815, 1242562, 1244310, 1246057, 1247805, 1249553, 1251300, 1253048, 1254795, 1254796, 1256543, 1258291, 1260038, 1261786, 1263534, 1265281, 1267029, 1268776, 1268777, 1270524, 1272272, 1274019, 1275767, 1277515, 1279262, 1281010, 1282757, 1282758, 1284505, 1286253, 1288000, 1289748, 1291496, 1293243, 1294991, 1296738, 1296739, 1298486, 1300234, 1301981, 1303729, 1305477, 1307224, 1308972, 1310719, 1310720, 1312467, 1314215, 1315962, 1315963, 1317710, 1319458, 1321205, 1322953, 1324701, 1326448, 1328196, 1329943, 1329944, 1331691, 1333439, 1335186, 1336934, 1338682, 1340429, 1342177, 1343924, 1343925, 1345672, 1347420, 1349167, 1350915, 1352663, 1354410, 1356158, 1357905, 1357906, 1359653, 1361401, 1363148, 1364896, 1366644, 1368391, 1370139, 1371886, 1371887, 1373634, 1375382, 1377129, 1378877, 1380625, 1382372, 1384120, 1385867, 1385868, 1387615, 1389363, 1391110, 1392858, 1394606, 1396353, 1398101, 1399848, 1399849, 1401596, 1403344, 1405091, 1406839, 1408587, 1410334, 1412082, 1413829, 1413830, 1415577, 1417325, 1419072, 1420820, 1422568, 1424315, 1426063, 1427810, 1427811, 1429558, 1431306, 1433053, 1434801, 1436549, 1438296, 1440044, 1441791, 1441792, 1443539, 1445287, 1447034, 1447035, 1448782, 1450530, 1452277, 1454025, 1455773, 1457520, 1459268, 1461015, 1461016, 1462763, 1464511, 1466258, 1468006, 1469754, 1471501, 1473249, 1474996, 1474997, 1476744, 1478492, 1480239, 1481987, 1483735, 1485482, 1487230, 1488977, 1488978, 1490725, 1492473, 1494220, 1495968, 1497716, 1499463, 1501211, 1502958, 1502959, 1504706, 1506454, 1508201, 1509949, 1511697, 1513444, 1515192, 1516939, 1516940, 1518687, 1520435, 1522182, 1523930, 1525678, 1527425, 1529173, 1530920, 1530921, 1532668, 1534416, 1536163, 1537911, 1539659, 1541406, 1543154, 1544901, 1544902, 1546649, 1548397, 1550144, 1551892, 1553640, 1555387, 1557135, 1558882, 1558883, 1560630, 1562378, 1564125, 1565873, 1567621, 1569368, 1571116, 1572863, 1572864, 1574611, 1576359, 1578106, 1578107, 1579854, 1581602, 1583349, 1585097, 1586845, 1588592, 1590340, 1592087, 1592088, 1593835, 1595583, 1597330, 1599078, 1600826, 1602573, 1604321, 1606068, 1606069, 1607816, 1609564, 1611311, 1613059, 1614807, 1616554, 1618302, 1620049, 1620050, 1621797, 1623545, 1625292, 1627040, 1628788, 1630535, 1632283, 1634030, 1634031, 1635778, 1637526, 1639273, 1641021, 1642769, 1644516, 1646264, 1648011, 1648012, 1649759, 1651507, 1653254, 1655002, 1656750, 1658497, 1660245, 1661992, 1661993, 1663740, 1665488, 1667235, 1668983, 1670731, 1672478, 1674226, 1675973, 1675974, 1677721, 1679469, 1681216, 1682964, 1684712, 1686459, 1688207, 1689954, 1689955, 1691702, 1693450, 1695197, 1696945, 1698693, 1700440, 1702188, 1703935, 1703936, 1705683, 1707431, 1709178, 1709179, 1710926, 1712674, 1714421, 1716169, 1717917, 1719664, 1721412, 1723159, 1723160, 1724907, 1726655, 1728402, 1730150, 1731898, 1733645, 1735393, 1737140, 1737141, 1738888, 1740636, 1742383, 1744131, 1745879, 1747626, 1749374, 1751121, 1751122, 1752869, 1754617, 1756364, 1758112, 1759860, 1761607, 1763355, 1765102, 1765103, 1766850, 1768598, 1770345, 1772093, 1773841, 1775588, 1777336, 1779083, 1779084, 1780831, 1782579, 1784326, 1786074, 1787822, 1789569, 1791317, 1793064, 1793065, 1794812, 1796560, 1798307, 1800055, 1801803, 1803550, 1805298, 1807045, 1807046, 1808793, 1810541, 1812288, 1814036, 1815784, 1817531, 1819279, 1821026, 1821027, 1822774, 1824522, 1826269, 1828017, 1829765, 1831512, 1833260, 1835007, 1835008, 1836755, 1838503, 1840250, 1840251, 1841998, 1843746, 1845493, 1847241, 1848989, 1850736, 1852484, 1854231, 1854232, 1855979, 1857727, 1859474, 1861222, 1862970, 1864717, 1866465, 1868212, 1868213, 1869960, 1871708, 1873455, 1875203, 1876951, 1878698, 1880446, 1882193, 1882194, 1883941, 1885689, 1887436, 1889184, 1890932, 1892679, 1894427, 1896174, 1896175, 1897922, 1899670, 1901417, 1903165, 1904913, 1906660, 1908408, 1910155, 1910156, 1911903, 1913651, 1915398, 1917146, 1918894, 1920641, 1922389, 1924136, 1924137, 1925884, 1927632, 1929379, 1931127, 1932875, 1934622, 1936370, 1938117, 1938118, 1939865, 1941613, 1943360, 1945108, 1946856, 1948603, 1950351, 1952098, 1952099, 1953846, 1955594, 1957341, 1959089, 1960837, 1962584, 1964332, 1966080, 1967827, 1969575, 1971322, 1971323, 1973070, 1974818, 1976565, 1978313, 1980061, 1981808, 1983556, 1985303, 1985304, 1987051, 1988799, 1990546, 1992294, 1994042, 1995789, 1997537, 1999284, 1999285, 2001032, 2002780, 2004527, 2006275, 2008023, 2009770, 2011518, 2013265, 2013266, 2015013, 2016761, 2018508, 2020256, 2022004, 2023751, 2025499, 2027246, 2027247, 2028994, 2030742, 2032489, 2034237, 2035985, 2037732, 2039480, 2041227, 2041228, 2042975, 2044723, 2046470, 2048218, 2049966, 2051713, 2053461, 2055208, 2055209, 2056956, 2058704, 2060451, 2062199, 2063947, 2065694, 2067442, 2069189, 2069190, 2070937, 2072685, 2074432, 2076180, 2077928, 2079675, 2081423, 2083170, 2083171, 2084918, 2086666, 2088413, 2090161, 2091909, 2093656, 2095404, 2097151, 2097152, 2100647, 2104142, 2107637, 2107638, 2111133, 2114628, 2118123, 2121618, 2121619, 2125114, 2128609, 2132104, 2135599, 2135600, 2139095, 2142590, 2146085, 2149580, 2149581, 2153076, 2156571, 2160066, 2163561, 2163562, 2167057, 2170552, 2174047, 2177542, 2177543, 2181038, 2184533, 2188028, 2191523, 2191524, 2195019, 2198514, 2202009, 2205504, 2205505, 2209000, 2212495, 2215990, 2219485, 2219486, 2222981, 2226476, 2229971, 2233466, 2233467, 2236962, 2240457, 2243952, 2247447, 2247448, 2250943, 2254438, 2257933, 2261428, 2261429, 2264924, 2268419, 2271914, 2275409, 2275410, 2278905, 2282400, 2285895, 2289390, 2289391, 2292886, 2296381, 2299876, 2303371, 2303372, 2306867, 2310362, 2313857, 2317352, 2317353, 2320848, 2324343, 2327838, 2331333, 2331334, 2334829, 2338324, 2341819, 2345314, 2345315, 2348810, 2352305, 2355800, 2359295, 2359296, 2362791, 2366286, 2369781, 2369782, 2373277, 2376772, 2380267, 2383762, 2383763, 2387258, 2390753, 2394248, 2397743, 2397744, 2401239, 2404734, 2408229, 2411724, 2411725, 2415220, 2418715, 2422210, 2425705, 2425706, 2429201, 2432696, 2436191, 2439686, 2439687, 2443182, 2446677, 2450172, 2453667, 2453668, 2457163, 2460658, 2464153, 2467648, 2467649, 2471144, 2474639, 2478134, 2481629, 2481630, 2485125, 2488620, 2492115, 2495610, 2495611, 2499106, 2502601, 2506096, 2509591, 2509592, 2513087, 2516582, 2520077, 2523572, 2523573, 2527068, 2530563, 2534058, 2537553, 2537554, 2541049, 2544544, 2548039, 2551534, 2551535, 2555030, 2558525, 2562020, 2565515, 2565516, 2569011, 2572506, 2576001, 2579496, 2579497, 2582992, 2586487, 2589982, 2593477, 2593478, 2596973, 2600468, 2603963, 2607458, 2607459, 2610954, 2614449, 2617944, 2621439, 2621440, 2624935, 2628430, 2631925, 2631926, 2635421, 2638916, 2642411, 2645906, 2645907, 2649402, 2652897, 2656392, 2659887, 2659888, 2663383, 2666878, 2670373, 2673868, 2673869, 2677364, 2680859, 2684354, 2687849, 2687850, 2691345, 2694840, 2698335, 2701830, 2701831, 2705326, 2708821, 2712316, 2715811, 2715812, 2719307, 2722802, 2726297, 2729792, 2729793, 2733288, 2736783, 2740278, 2743773, 2743774, 2747269, 2750764, 2754259, 2757754, 2757755, 2761250, 2764745, 2768240, 2771735, 2771736, 2775231, 2778726, 2782221, 2785716, 2785717, 2789212, 2792707, 2796202, 2799697, 2799698, 2803193, 2806688, 2810183, 2813678, 2813679, 2817174, 2820669, 2824164, 2827659, 2827660, 2831155, 2834650, 2838145, 2841640, 2841641, 2845136, 2848631, 2852126, 2855621, 2855622, 2859117, 2862612, 2866107, 2869602, 2869603, 2873098, 2876593, 2880088, 2883583, 2883584, 2887079, 2890574, 2894069, 2894070, 2897565, 2901060, 2904555, 2908050, 2908051, 2911546, 2915041, 2918536, 2922031, 2922032, 2925527, 2929022, 2932517, 2936012, 2936013, 2939508, 2943003, 2946498, 2949993, 2949994, 2953489, 2956984, 2960479, 2963974, 2963975, 2967470, 2970965, 2974460, 2977955, 2977956, 2981451, 2984946, 2988441, 2991936, 2991937, 2995432, 2998927, 3002422, 3005917, 3005918, 3009413, 3012908, 3016403, 3019898, 3019899, 3023394, 3026889, 3030384, 3033879, 3033880, 3037375, 3040870, 3044365, 3047860, 3047861, 3051356, 3054851, 3058346, 3061841, 3061842, 3065337, 3068832, 3072327, 3075822, 3075823, 3079318, 3082813, 3086308, 3089803, 3089804, 3093299, 3096794, 3100289, 3103784, 3103785, 3107280, 3110775, 3114270, 3117765, 3117766, 3121261, 3124756, 3128251, 3131746, 3131747, 3135242, 3138737, 3142232, 3145727, 3145728, 3149223, 3152718, 3156213, 3156214, 3159709, 3163204, 3166699, 3170194, 3170195, 3173690, 3177185, 3180680, 3184175, 3184176, 3187671, 3191166, 3194661, 3198156, 3198157, 3201652, 3205147, 3208642, 3212137, 3212138, 3215633, 3219128, 3222623, 3226118, 3226119, 3229614, 3233109, 3236604, 3240099, 3240100, 3243595, 3247090, 3250585, 3254080, 3254081, 3257576, 3261071, 3264566, 3268061, 3268062, 3271557, 3275052, 3278547, 3282042, 3282043, 3285538, 3289033, 3292528, 3296023, 3296024, 3299519, 3303014, 3306509, 3310004, 3310005, 3313500, 3316995, 3320490, 3323985, 3323986, 3327481, 3330976, 3334471, 3337966, 3337967, 3341462, 3344957, 3348452, 3351947, 3351948, 3355443, 3358938, 3362433, 3365928, 3365929, 3369424, 3372919, 3376414, 3379909, 3379910, 3383405, 3386900, 3390395, 3393890, 3393891, 3397386, 3400881, 3404376, 3407871, 3407872, 3411367, 3414862, 3418357, 3418358, 3421853, 3425348, 3428843, 3432338, 3432339, 3435834, 3439329, 3442824, 3446319, 3446320, 3449815, 3453310, 3456805, 3460300, 3460301, 3463796, 3467291, 3470786, 3474281, 3474282, 3477777, 3481272, 3484767, 3488262, 3488263, 3491758, 3495253, 3498748, 3502243, 3502244, 3505739, 3509234, 3512729, 3516224, 3516225, 3519720, 3523215, 3526710, 3530205, 3530206, 3533701, 3537196, 3540691, 3544186, 3544187, 3547682, 3551177, 3554672, 3558167, 3558168, 3561663, 3565158, 3568653, 3572148, 3572149, 3575644, 3579139, 3582634, 3586129, 3586130, 3589625, 3593120, 3596615, 3600110, 3600111, 3603606, 3607101, 3610596, 3614091, 3614092, 3617587, 3621082, 3624577, 3628072, 3628073, 3631568, 3635063, 3638558, 3642053, 3642054, 3645549, 3649044, 3652539, 3656034, 3656035, 3659530, 3663025, 3666520, 3670015, 3670016, 3673511, 3677006, 3680501, 3680502, 3683997, 3687492, 3690987, 3694482, 3694483, 3697978, 3701473, 3704968, 3708463, 3708464, 3711959, 3715454, 3718949, 3722444, 3722445, 3725940, 3729435, 3732930, 3736425, 3736426, 3739921, 3743416, 3746911, 3750406, 3750407, 3753902, 3757397, 3760892, 3764387, 3764388, 3767883, 3771378, 3774873, 3778368, 3778369, 3781864, 3785359, 3788854, 3792349, 3792350, 3795845, 3799340, 3802835, 3806330, 3806331, 3809826, 3813321, 3816816, 3820311, 3820312, 3823807, 3827302, 3830797, 3834292, 3834293, 3837788, 3841283, 3844778, 3848273, 3848274, 3851769, 3855264, 3858759, 3862254, 3862255, 3865750, 3869245, 3872740, 3876235, 3876236, 3879731, 3883226, 3886721, 3890216, 3890217, 3893712, 3897207, 3900702, 3904197, 3904198, 3907693, 3911188, 3914683, 3918178, 3918179, 3921674, 3925169, 3928664, 3932160, 3935655, 3939150, 3942645, 3942646, 3946141, 3949636, 3953131, 3956626, 3956627, 3960122, 3963617, 3967112, 3970607, 3970608, 3974103, 3977598, 3981093, 3984588, 3984589, 3988084, 3991579, 3995074, 3998569, 3998570, 4002065, 4005560, 4009055, 4012550, 4012551, 4016046, 4019541, 4023036, 4026531, 4026532, 4030027, 4033522, 4037017, 4040512, 4040513, 4044008, 4047503, 4050998, 4054493, 4054494, 4057989, 4061484, 4064979, 4068474, 4068475, 4071970, 4075465, 4078960, 4082455, 4082456, 4085951, 4089446, 4092941, 4096436, 4096437, 4099932, 4103427, 4106922, 4110417, 4110418, 4113913, 4117408, 4120903, 4124398, 4124399, 4127894, 4131389, 4134884, 4138379, 4138380, 4141875, 4145370, 4148865, 4152360, 4152361, 4155856, 4159351, 4162846, 4166341, 4166342, 4169837, 4173332, 4176827, 4180322, 4180323, 4183818, 4187313, 4190808, 4194303, 4194304, 4201294, 4201295, 4208285, 4215275, 4215276, 4222266, 4229256, 4229257, 4236247, 4243237, 4243238, 4250228, 4257218, 4257219, 4264209, 4271199, 4271200, 4278190, 4285180, 4285181, 4292171, 4299161, 4299162, 4306152, 4313142, 4313143, 4320133, 4327123, 4327124, 4334114, 4341104, 4341105, 4348095, 4355085, 4355086, 4362076, 4369066, 4369067, 4376057, 4383047, 4383048, 4390038, 4397028, 4397029, 4404019, 4411009, 4411010, 4418000, 4424990, 4424991, 4431981, 4438971, 4438972, 4445962, 4452952, 4452953, 4459943, 4466933, 4466934, 4473924, 4480914, 4480915, 4487905, 4494895, 4494896, 4501886, 4508876, 4508877, 4515867, 4522857, 4522858, 4529848, 4536838, 4536839, 4543829, 4550819, 4550820, 4557810, 4564800, 4564801, 4571791, 4578781, 4578782, 4585772, 4592762, 4592763, 4599753, 4606743, 4606744, 4613734, 4620724, 4620725, 4627715, 4634705, 4634706, 4641696, 4648686, 4648687, 4655677, 4662667, 4662668, 4669658, 4676648, 4676649, 4683639, 4690629, 4690630, 4697620, 4704610, 4704611, 4711601, 4718591, 4718592, 4725582, 4725583, 4732573, 4739563, 4739564, 4746554, 4753544, 4753545, 4760535, 4767525, 4767526, 4774516, 4781506, 4781507, 4788497, 4795487, 4795488, 4802478, 4809468, 4809469, 4816459, 4823449, 4823450, 4830440, 4837430, 4837431, 4844421, 4851411, 4851412, 4858402, 4865392, 4865393, 4872383, 4879373, 4879374, 4886364, 4893354, 4893355, 4900345, 4907335, 4907336, 4914326, 4921316, 4921317, 4928307, 4935297, 4935298, 4942288, 4949278, 4949279, 4956269, 4963259, 4963260, 4970250, 4977240, 4977241, 4984231, 4991221, 4991222, 4998212, 5005202, 5005203, 5012193, 5019183, 5019184, 5026174, 5033164, 5033165, 5040155, 5047145, 5047146, 5054136, 5061126, 5061127, 5068117, 5075107, 5075108, 5082098, 5089088, 5089089, 5096079, 5103069, 5103070, 5110060, 5117050, 5117051, 5124041, 5131031, 5131032, 5138022, 5145012, 5145013, 5152003, 5158993, 5158994, 5165984, 5172974, 5172975, 5179965, 5186955, 5186956, 5193946, 5200936, 5200937, 5207927, 5214917, 5214918, 5221908, 5228898, 5228899, 5235889, 5242879, 5242880, 5249870, 5249871, 5256861, 5263851, 5263852, 5270842, 5277832, 5277833, 5284823, 5291813, 5291814, 5298804, 5305794, 5305795, 5312785, 5319775, 5319776, 5326766, 5333756, 5333757, 5340747, 5347737, 5347738, 5354728, 5361718, 5361719, 5368709, 5375699, 5375700, 5382690, 5389680, 5389681, 5396671, 5403661, 5403662, 5410652, 5417642, 5417643, 5424633, 5431623, 5431624, 5438614, 5445604, 5445605, 5452595, 5459585, 5459586, 5466576, 5473566, 5473567, 5480557, 5487547, 5487548, 5494538, 5501528, 5501529, 5508519, 5515509, 5515510, 5522500, 5529490, 5529491, 5536481, 5543471, 5543472, 5550462, 5557452, 5557453, 5564443, 5571433, 5571434, 5578424, 5585414, 5585415, 5592405, 5599395, 5599396, 5606386, 5613376, 5613377, 5620367, 5627357, 5627358, 5634348, 5641338, 5641339, 5648329, 5655319, 5655320, 5662310, 5669300, 5669301, 5676291, 5683281, 5683282, 5690272, 5697262, 5697263, 5704253, 5711243, 5711244, 5718234, 5725224, 5725225, 5732215, 5739205, 5739206, 5746196, 5753186, 5753187, 5760177, 5767167, 5767168, 5774158, 5774159, 5781149, 5788139, 5788140, 5795130, 5802120, 5802121, 5809111, 5816101, 5816102, 5823092, 5830082, 5830083, 5837073, 5844063, 5844064, 5851054, 5858044, 5858045, 5865035, 5872025, 5872026, 5879016, 5886006, 5886007, 5892997, 5899987, 5899988, 5906978, 5913968, 5913969, 5920959, 5927949, 5927950, 5934940, 5941930, 5941931, 5948921, 5955911, 5955912, 5962902, 5969892, 5969893, 5976883, 5983873, 5983874, 5990864, 5997854, 5997855, 6004845, 6011835, 6011836, 6018826, 6025816, 6025817, 6032807, 6039797, 6039798, 6046788, 6053778, 6053779, 6060769, 6067759, 6067760, 6074750, 6081740, 6081741, 6088731, 6095721, 6095722, 6102712, 6109702, 6109703, 6116693, 6123683, 6123684, 6130674, 6137664, 6137665, 6144655, 6151645, 6151646, 6158636, 6165626, 6165627, 6172617, 6179607, 6179608, 6186598, 6193588, 6193589, 6200579, 6207569, 6207570, 6214560, 6221550, 6221551, 6228541, 6235531, 6235532, 6242522, 6249512, 6249513, 6256503, 6263493, 6263494, 6270484, 6277474, 6277475, 6284465, 6291455, 6291456, 6298446, 6298447, 6305437, 6312427, 6312428, 6319418, 6326408, 6326409, 6333399, 6340389, 6340390, 6347380, 6354370, 6354371, 6361361, 6368351, 6368352, 6375342, 6382332, 6382333, 6389323, 6396313, 6396314, 6403304, 6410294, 6410295, 6417285, 6424275, 6424276, 6431266, 6438256, 6438257, 6445247, 6452237, 6452238, 6459228, 6466218, 6466219, 6473209, 6480199, 6480200, 6487190, 6494180, 6494181, 6501171, 6508161, 6508162, 6515152, 6522142, 6522143, 6529133, 6536123, 6536124, 6543114, 6550104, 6550105, 6557095, 6564085, 6564086, 6571076, 6578066, 6578067, 6585057, 6592047, 6592048, 6599038, 6606028, 6606029, 6613019, 6620009, 6620010, 6627000, 6633990, 6633991, 6640981, 6647971, 6647972, 6654962, 6661952, 6661953, 6668943, 6675933, 6675934, 6682924, 6689914, 6689915, 6696905, 6703895, 6703896, 6710886, 6717876, 6717877, 6724867, 6731857, 6731858, 6738848, 6745838, 6745839, 6752829, 6759819, 6759820, 6766810, 6773800, 6773801, 6780791, 6787781, 6787782, 6794772, 6801762, 6801763, 6808753, 6815743, 6815744, 6822734, 6822735, 6829725, 6836715, 6836716, 6843706, 6850696, 6850697, 6857687, 6864677, 6864678, 6871668, 6878658, 6878659, 6885649, 6892639, 6892640, 6899630, 6906620, 6906621, 6913611, 6920601, 6920602, 6927592, 6934582, 6934583, 6941573, 6948563, 6948564, 6955554, 6962544, 6962545, 6969535, 6976525, 6976526, 6983516, 6990506, 6990507, 6997497, 7004487, 7004488, 7011478, 7018468, 7018469, 7025459, 7032449, 7032450, 7039440, 7046430, 7046431, 7053421, 7060411, 7060412, 7067402, 7074392, 7074393, 7081383, 7088373, 7088374, 7095364, 7102354, 7102355, 7109345, 7116335, 7116336, 7123326, 7130316, 7130317, 7137307, 7144297, 7144298, 7151288, 7158278, 7158279, 7165269, 7172259, 7172260, 7179250, 7186240, 7186241, 7193231, 7200221, 7200222, 7207212, 7214202, 7214203, 7221193, 7228183, 7228184, 7235174, 7242164, 7242165, 7249155, 7256145, 7256146, 7263136, 7270126, 7270127, 7277117, 7284107, 7284108, 7291098, 7298088, 7298089, 7305079, 7312069, 7312070, 7319060, 7326050, 7326051, 7333041, 7340031, 7340032, 7347022, 7347023, 7354013, 7361003, 7361004, 7367994, 7374984, 7374985, 7381975, 7388965, 7388966, 7395956, 7402946, 7402947, 7409937, 7416927, 7416928, 7423918, 7430908, 7430909, 7437899, 7444889, 7444890, 7451880, 7458870, 7458871, 7465861, 7472851, 7472852, 7479842, 7486832, 7486833, 7493823, 7500813, 7500814, 7507804, 7514794, 7514795, 7521785, 7528775, 7528776, 7535766, 7542756, 7542757, 7549747, 7556737, 7556738, 7563728, 7570718, 7570719, 7577709, 7584699, 7584700, 7591690, 7598680, 7598681, 7605671, 7612661, 7612662, 7619652, 7626642, 7626643, 7633633, 7640623, 7640624, 7647614, 7654604, 7654605, 7661595, 7668585, 7668586, 7675576, 7682566, 7682567, 7689557, 7696547, 7696548, 7703538, 7710528, 7710529, 7717519, 7724509, 7724510, 7731500, 7738490, 7738491, 7745481, 7752471, 7752472, 7759462, 7766452, 7766453, 7773443, 7780433, 7780434, 7787424, 7794414, 7794415, 7801405, 7808395, 7808396, 7815386, 7822376, 7822377, 7829367, 7836357, 7836358, 7843348, 7850338, 7850339, 7857329, 7864320, 7871310, 7871311, 7878301, 7885291, 7885292, 7892282, 7899272, 7899273, 7906263, 7913253, 7913254, 7920244, 7927234, 7927235, 7934225, 7941215, 7941216, 7948206, 7955196, 7955197, 7962187, 7969177, 7969178, 7976168, 7983158, 7983159, 7990149, 7997139, 7997140, 8004130, 8011120, 8011121, 8018111, 8025101, 8025102, 8032092, 8039082, 8039083, 8046073, 8053063, 8053064, 8060054, 8067044, 8067045, 8074035, 8081025, 8081026, 8088016, 8095006, 8095007, 8101997, 8108987, 8108988, 8115978, 8122968, 8122969, 8129959, 8136949, 8136950, 8143940, 8150930, 8150931, 8157921, 8164911, 8164912, 8171902, 8178892, 8178893, 8185883, 8192873, 8192874, 8199864, 8206854, 8206855, 8213845, 8220835, 8220836, 8227826, 8234816, 8234817, 8241807, 8248797, 8248798, 8255788, 8262778, 8262779, 8269769, 8276759, 8276760, 8283750, 8290740, 8290741, 8297731, 8304721, 8304722, 8311712, 8318702, 8318703, 8325693, 8332683, 8332684, 8339674, 8346664, 8346665, 8353655, 8360645, 8360646, 8367636, 8374626, 8374627, 8381617, 8388607) ORDER BY i ASC ;'

r1 = await pool.query(sql1);
    
timeend('join');



}


