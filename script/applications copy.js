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
//const { Pool } = require('pg');
const { Pool, types } = require('pg');
const { InfluxDB } = require('@influxdata/influxdb-client');
// 将NUMERIC类型的数据自动转换为浮点数
types.setTypeParser(1700, (val) => parseFloat(val));

let db_use = 'duckdb'
const duckdb = require('duckdb');

// 创建 DuckDB 数据库连接
const db = new duckdb.Database('../data/nycdata_om3.db');

// 创建查询会话
const connection = db.connect();



const { Heap }  = require('heap-js');
const { get } = require("http");

const dbConfig = JSON.parse(fs.readFileSync("../initdb/dbconfig.json").toString());

let debug = false

const pool = new Pool({
    user: dbConfig['username'],
    host: dbConfig["hostname"],
    database: dbConfig['db'],
    password: dbConfig['password'],
});



let queryCounts = 0

let element = {
    value:0,
    nodePairs: null
};


let tableBCache = null
let treeCache = {}

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

let MAXNODENUM = 0
let memeryCache = 0

// 定义 SegmentTreeNode 类
class SegmentTreeNode {
    constructor(sTime, eTime, level, index, i, min = 0, max = 0, ave = 0, id, 
        minDiff = null, maxDiff = null, aveDiff = null, leftChild = null, rightChild = null, leftIndex = null, rightIndex = null, parent = null, isBuild=false) {
        
        this.sTime = sTime;       // 开始时间
        this.eTime = eTime;       // 结束时间
        this.level = level;       // 层级
        this.index = index;       // 当前节点的索引
        this.i = i;               // 当前节点在该层的第几个位置
        this.min = min;           // 当前节点的最小值
        this.max = max;           // 当前节点的最大值
        this.ave = ave;
        this.sum = ave*(eTime-sTime+1)

        this.id = id;             // 当前节点的唯一ID
        this.minDiff = minDiff;   // min值的差异
        this.maxDiff = maxDiff;   // max值的差异
        this.aveDiff = aveDiff;
        this.leftChild = leftChild;         // 左孩子节点
        this.rightChild = rightChild;       // 右孩子节点
        this.leftIndex = leftIndex;   // 左孩子的索引
        this.rightIndex = rightIndex; // 右孩子的索引
        this.parent = parent; //父亲节点
        this.isBuild = isBuild

        this.isHuisu = false

        //双向链表
        this.preNode = null
        this.nextNode = null

        //nodeCount ++

    }
}


// 定义 SegmentTree 类
class SegmentTree {
    constructor(tableName,columns,index, flagBuffer, maxNodeNum=0) {
        this.root = null;          // 根节点
        this.realDataNum = MAXNODENUM
        this.maxNodeNum = MAXNODENUM
        this.max_level = 0
        //this.nodes = new Array(maxNodes).fill(null);
        this.nodes = {}
        this.table_name = tableName;   // 数据库中的表名，命令行传入
        this.columns = columns
        this.index = index
        this.flag = flagBuffer;     // 读取的 flag 二进制数组
        this.cache = null

        //
        this.minDLL = new DLL()
        this.maxDLL = new DLL()

        //存储树的最底层次的外围节点。
        this.bottonLevelDLL = new DLL()
        this.head = null

        this.nodeCount =0
        this.nodeCountDelta =0

        this.belongsToScreen = null
        this.funInfo = null

        this.patentDelete = false
    }

    // 添加节点方法
    addNode(sTime, eTime, level, index, i, min = 0, max = 0, ave = 0, id, 
        minDiff = null, maxDiff = null, aveDiff = null, leftChild = null, rightChild = null, leftIndex = null, rightIndex = null, parent = null, isBuild=false) {
        
        const node = new SegmentTreeNode(sTime, eTime, level, index, i, min, max, ave, id, 
            minDiff, maxDiff, aveDiff, leftChild, rightChild, leftIndex, rightIndex, parent, isBuild);
        
        this.nodeCount ++ 
        this.nodeCountDelta ++

        if (this.root === null) {
            this.root = node;     // 如果根节点为空，则设置为根节点
        }

        //this.nodes[index] = new SegmentTreeNode(sTime, eTime, level, index, i, min, max, id, minDiff, maxDiff, leftChild, rightChild, leftIndex, rightIndex);    // 将节点添加到数组中
        return node;
    }


    buildParent(leftNode, rightNode){
        //不是同一个父亲
        if(leftNode.parent.sTime != rightNode.parent.sTime){
            console.log('不是同一个父亲')
            return null
        }
        
        if(!leftNode.parent.isBuild){
            leftNode.parent.isBuild = true
            this.nodeCount ++ 
            this.nodeCountDelta ++
        }

        return leftNode.parent
    }

    deleteNode(node){
        if(node.isBuild == false){
            //说明已经delete过了
            return
        }

        node.isBuild = false;
        this.nodeCount --
        this.nodeCountDelta --
    }

    deleteAllParents(){
        if(this.patentDelete){
            return
        }
        this.patentDelete = true

        if(this.head == null){
            console.log("this.head = null")
            return
        }
        let node = this.head

        while(node != null){
            let parent = node.parent
            if(parent == null){
                console.log("patent == null")
                node = node.nextNode
                continue
            }

            //不断向上删除parent，直到parent为空或者已经删除
            while(parent!=null){
                if(!parent.isBuild){
                    break
                }
                this.deleteNode(parent)
                parent = parent.patent
            }

            node = node.nextNode
        }
    }


    // 获取所有节点
    getNodes() {
        return this.nodes;
    }
}

// 从数据库读取表 b 数据
async function readTableBFromDB(querySQL) {
    try {

        timestart('SQL.query.time');
        //console.log(querySQL)
        const result = await pool.query(querySQL);
        timeend('SQL.query.time');
        
        //timestart('rows.map');
        //let a = result.rows.map(row => [row.i, Number(row.minvd), Number(row.maxvd)]);

        let a = result.rows.map(row => Object.values(row));

        //console.log(a)

        // a = result.rows
        // console.log(a)
        //timeend('rows.map');

        return a

    } catch (error) {
        console.error('读取数据库表 b 发生错误:', error);
        //process.exit(1);
    }
}


async function readTableBFromDBWithJoin(querySQL, joinNum) {
    try {
        //console.log(querySQL) 
        queryCounts++
        //console.log(`${queryCounts}th query`)
        //console.time('readTableBFromDB'); // 开始计时
        const result = await pool.query(querySQL);
        //console.timeEnd('readTableBFromDB'); // 结束计时并打印结果
        //console.log(``)
        // 使用 `map` 将 minvd 和 maxvd 转换为数字类型
        //return result.rows.map(row => [row.i, Number(row.minvd), Number(row.maxvd)]);
        return result.rows.map(row => [row.i, Number(row.minvd), Number(row.maxvd)]);
    } catch (error) {
        console.error('读取数据库表 b 发生错误:', error);
        //process.exit(1);
    }
}


// 从缓存读取表 b 数据
async function readTableBFromCache(querySQL, index) {

    if(!isMergeTable){
        tableBCache = null
    }

    //从数据库初始化cache
    // index==0，表示用第一个column，构建第一课树，所以要初始化cache。
    if(tableBCache == null || index == 0){
        //console.log(index)
        tableBCache = await readTableBFromDB(querySQL);  // 从数据库读取表 b
        //console.log('tree.cache.length',tree.cache.length)
    }


    return tableBCache

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

        this.alternativeNodesMax = null;
        this.alternativeNodesMin = null;

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
        this.stNodes = []   //像素列左边界的node index
        this.etNodes = []   //像素列内右边界node index

        this.stNodeIndex = null   //像素列左边界的node index
        this.etNodeIndex = null   //像素列内右边界node index


        //跟计算有关的
        this.alternativeNodesMax = null
        this.alternativeNodesMin = null;
        this.currentComputingNodeMax = null
        this.currentComputingNodeMin = null
        this.currentComputingIntervalMax = null
        this.currentComputingIntervalMin = null
        this.isCompletedMax = false;
        this.isCompletedMin = false;

        //跟计算均值有关
        this.stInterval = null
        this.etInterval = null
        this.minDLL = null
        this.maxDLL = null
        this.stNodes = []
        this.etNodes = []


        //error bound 相关
        this.errorPixels = 0

    }
    
}

class SCREEN_M4 {

    constructor(experiment,datasetname,quantity,symbolName,width,height,errorBound, func){
        this.M4_arrays = [],
        this.min_values = [],
        this.max_values = []
        
        this.sx = ''

        this.M4_array = null
        this.screenEnd = 0
        this.screenStart=0
        this.height=height
        this.width=width
        this.experiment = experiment
        this.datasetname = datasetname
        this.symbolName = symbolName
        this.errorBound = errorBound
        this.quantity = quantity
        this.func = func
        this.nodeReductionRatio = 0
        this.SQLtime = 0
        this.totalTime=0

        this.buildNodeRate = 0
        this.segmentTrees = null
        this.dataReductionRatio = 0

        this.maxNodeNum = 0
        this.nodeCount = 0
        this.memLimit = 0
        this.interact_type = ''
        this.columns = []



        this.exactMax=-Infinity
        this.exactMin=Infinity
        this.avgtMax = -Infinity
        this.avgtMin = Infinity
        this.candidateMax=-Infinity
        this.candidateMin=Infinity


        this.preError = 0
        this.deltaError = 0

        this.count=0

        //一些与时间相关的变量
        // 查询区间的开始、结束，对应数据库中的t，0开始
        this.screenEnd = 0
        this.screenStart=0

        //数据集对应的开始时间和结束时间的时间戳，时间间隔（秒），如 2015-1-1 0:0:0，时间间隔60秒
        this.dataStartTime = -1
        this.dataEndTime = -1
        this.dataDelta = -1
        this.dataCont = -1

        //所有区间的第一个区间开始时间戳，最后一个区间结束的时间戳
        this.globalIntervalStartTime = 1420041600
        this.globalIntervalEndTime = 1704038399

        // 查询区间的开始、结束,在该数据集汇总对应的时间戳
        this.screenStartTimestamp = 1420041600
        this.screenEndTimestamp = 1704038399

        this.globalIntervalStart=-1
        this.globalIntervalEnd=-1

        this.delta = 60

        //区间的长度，对应包含多少个数据点个数，而不是时间。
        this.intervalLength = 60 
    }
}

class Interval{
    constructor(sTime,eTime, minTime=-Infinity, maxTime=Infinity){
        this.start_time = Math.max(sTime, minTime)
        this.end_time = Math.min(eTime, maxTime)
        this.nodes = []
        this.isSame = false
        this.sum = null
        this.ave = null
    }

}


class IntervalCache{
    constructor(table, column ,globalStart, globalEnd, intervals){
        this.globalStart = globalStart
        this.globalEnd = globalEnd
        this.intervals = intervals
        this.table = table
        this.column = column
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
function sympleCalculate(min1, max1, min2, max2, operator, destination, isLeaf) {
    if (destination === 'min') {
        switch (operator) {
            case '+':
                return Math.min(min1 + min2, min1 + max2, max1 + min2, max1 + max2);
            case '-':
                return Math.min(min1 - min2, min1 - max2, max1 - min2, max1 - max2);
            case '*':
                return Math.min(min1 * min2, min1 * max2, max1 * min2, max1 * max2);
            case '/':
                if(min2 == 0){
                    if(isLeaf){
                        return 0
                    }
                    min2 = 1
                }
                if(max2 == 0){
                    max2 =1
                    if(isLeaf){
                        return 0
                    }
                }
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
                if(min2 == 0){
                    min2 = 1
                    if(isLeaf){
                        return 0
                    }
                }
                if(max2 == 0){
                    max2 =1
                    if(isLeaf){
                        return 0
                    }
                }
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

function calMean(computingNodes, destination){
    let sum = 0
    if (destination === 'min') {
        for(let i=0;i<computingNodes.length;i++){
            sum += computingNodes[i].min
        }
    }else{
        for(let i=0;i<computingNodes.length;i++){
            sum += computingNodes[i].max
        }
    }

    return sum/computingNodes.length
}

function getClosestVal(node, val) {
    if (val < node.min) {
        return node.min;
    } else if (val > node.max) {
        return node.max;
    }
    return val;
}

function computeMinVariance(minmaxVals) {
    const result = mergeCompute(minmaxVals, 0, minmaxVals.length);
    if (result.length === 2) { // An intersection exists across all the time series
        return 0;
    } else {
        const estimatedAvg = result[0] / minmaxVals.length;
        const minVarList = minmaxVals.map(vals => getClosestVal(vals, estimatedAvg));
        // console.log(minVarList)
        return minVarList;
    }
}

function mergeCompute(minmaxVals, start, end) {
    if (end - start === 1) {
        // console.log([minmaxVals[start].min, minmaxVals[start].max])
        return [minmaxVals[start].min, minmaxVals[start].max];
    }
    const mid = Math.floor((start + end + 1) / 2);
    const resultL = mergeCompute(minmaxVals, start, mid);
    const resultR = mergeCompute(minmaxVals, mid, end);
    
    // console.log(mid, resultL, resultR);
    
    if (resultL.length === 2 && resultR.length === 2) {
        // compute intersection
        const intersection = [Math.max(resultL[0], resultR[0]), Math.min(resultL[1], resultR[1])];
        if (intersection[0] <= intersection[1]) {
            return intersection;
        } else { // no intersection
            if (resultL[0] === intersection[0]) {
                return [intersection[0] * (mid - start) + intersection[1] * (end - mid)];
            } else {
                return [intersection[1] * (mid - start) + intersection[0] * (end - mid)];
            }
        }
    } else if (resultL.length === 1 && resultR.length === 1) {
        return [resultL[0] + resultR[0]];
    } else {
        if (resultL.length === 2) { // resultR.length === 1
            const avgR = resultR[0] / (end - mid);
            return [getClosestVal(resultL, avgR) * (mid - start) + resultR[0]];
        } else { // resultL.length === 1 and resultR.length === 2
            const avgL = resultL[0] / (mid - start);
            return [resultL[0] + getClosestVal(resultR, avgL) * (end - mid)];
        }
    }
}

function computeMaxVariance(minmaxVals) {
    let count = 1;
    let maxVarSums = [...[minmaxVals[0].min, minmaxVals[0].max]];
    // console.log(maxVarSums)
    let maxVarList = maxVarSums.map(i => [i]);
    // console.log(maxVarList)
    
    for (let vals of minmaxVals.slice(1)) {
        count++;
        for (let i = 0; i < maxVarSums.length; i++) {
            const addMin = maxVarSums[i] + vals.min;
            const addMax = maxVarSums[i] + vals.max;
            
            if (Math.abs(vals.min - addMin / count) > Math.abs(vals.max - addMax / count)) {
                maxVarSums[i] = addMin;
                maxVarList[i].push(vals.min);
            } else {
                maxVarSums[i] = addMax;
                maxVarList[i].push(vals.max);
            }
        }
    }
    //console.log(maxVarList)
    return maxVarList;
}

function sympleMean(computeData){
    let r=0
    for (let i = 0; i < computeData.length; i++) {
        r += computeData[i]
    }
    r /= computeData.length;

    return r
}

function sympleVariance(computeData){
    let mean = sympleMean(computeData)

    let r = 0
    for (let i = 0; i < computeData.length; i++) {
        r += (computeData[i] - mean) ** 2
    }

    return r /= computeData.length
}

function calVarianceEstimate(computingNodes, destination){
    if (destination === 'min') {
        let minArray =  computeMinVariance(computingNodes)
        if(minArray ===0){
            return 0
        }
        return sympleVariance(minArray)
    } else {
        let maxArray =  computeMaxVariance(computingNodes)
        return Math.max(sympleVariance(maxArray[0]), sympleVariance(maxArray[1]))
    }
}

function calVarianceExact(computingNodes, destination){
   
    let mean = calMean(computingNodes, destination)
    let sum = 0
    for (let i = 0; i < computingNodes.length; i++) {
        sum += (computingNodes[i].min - mean) ** 2
    }

    return sum/computingNodes.length
}

function calVariance(computingNodes, destination, isLeaf){
    
    if(isLeaf){
        return calVarianceExact(computingNodes, destination)
    }else{
        return calVarianceEstimate(computingNodes, destination)
    }

}

//统一的计算，既可以单条，也可以多条,trees计算对象，func计算函数，+-*/或其他复杂函数，mode：single or multi
function unifiedCalulate(trees, computingNodes, func, mode, isLeaf){

    if(computingNodes == null || computingNodes.length == 0){
        return {
            tmpmin: null,
            tmpmax: null
        }
    }

    let tmpmin = 0;
    let tmpmax = 0;
    if (func.funName == '+' || func.funName == '-' || func.funName == '*' || func.funName == '/') {
        //写一个min、max的计算的排列组合，目前用sympleCalculate暂代。
        tmpmin = sympleCalculate(
            computingNodes[0].min
            , computingNodes[0].max
            , computingNodes[1].min
            , computingNodes[1].max
            , func.funName
            , 'min', isLeaf);

        tmpmax = sympleCalculate(
            computingNodes[0].min
            , computingNodes[0].max
            , computingNodes[1].min
            , computingNodes[1].max
            , func.funName
            , 'max', isLeaf);
    } else if (func.funName == 'mean') {
        tmpmin = calMean(computingNodes, 'min')
        if(isLeaf){
            tmpmax=tmpmin
        }else{
            tmpmax = calMean(computingNodes, 'max')
        }
        // tmpmin = calMean(computingNodes, 'min')
        // tmpmax = calMean(computingNodes, 'max')
    } else if (func.funName == 'variance') {
        tmpmin = calVariance(computingNodes, 'min', isLeaf)
        if(isLeaf){
            tmpmax=tmpmin
        }else{
            tmpmax = calVariance(computingNodes, 'max', isLeaf)
        }
        // tmpmin = calVariance(computingNodes, 'min', isLeaf)
        // tmpmax = calVariance(computingNodes, 'max', isLeaf)
    }else if(func.funName == 'func4'){
        tmpmin = func.func4(computingNodes, 'min', isLeaf)
        if(isLeaf){
            tmpmax=tmpmin
        }else{
            tmpmax = func.func4(computingNodes, 'max', isLeaf)
        }
    }else if(func.funName == 'func1' || func.funName == 'boxcox_0' 
        || func.funName == 'boxcox_1_2' || func.funName == 'boxcox_1' || func.funName == 'boxcox_2'){
        
        tmpmin = func.compute(func.funName, computingNodes, 'min')
        if(isLeaf){
            tmpmax=tmpmin
        }else{
            tmpmax = func.compute(func.funName, computingNodes, 'max')
        }
    }else if(func.funName == 'ave' || func.funName == 'sum' ){
        let {tmpmin:tmpmin1,tmpmax:tmpmax1} = intervalEstimate(trees, computingNodes, func, mode, isLeaf)
        tmpmin = tmpmin1
        tmpmax = tmpmax1
    }else if(func.funName == 'weightsum'){
        tmpmin = func.weightsum(computingNodes, 'min', isLeaf)
        if(isLeaf){
            tmpmax=tmpmin
        }else{
            tmpmax = func.weightsum(computingNodes, 'max', isLeaf)
        }
    }else if(func.funName == 'L2'){
        tmpmin = func.L2(computingNodes, 'min', isLeaf)
        if(isLeaf){
            tmpmax=tmpmin
        }else{
            tmpmax = func.L2(computingNodes, 'max', isLeaf)
        }
    }else if(func.funName == 'max'){
        tmpmin = func.getmax(computingNodes, 'min', isLeaf)
        if(isLeaf){
            tmpmax=tmpmin
        }else{
            tmpmax = func.getmax(computingNodes, 'max', isLeaf)
        }
    }



    
    
    
    else{
        // let Xs = generateXs(computingNodes[0].min, func.extremes, computingNodes[0].max)
        // let Ys = func.computes(Xs)
        // tmpmin = Math.min(...Ys)
        // tmpmax = Math.max(...Ys)
    }


    return {
        tmpmin: tmpmin,
        tmpmax: tmpmax
    }





    if(func.mode == 'multi'){
        //写一个min、max的计算的排列组合，目前用sympleCalculate暂代。
        tmpmin = sympleCalculate(
            computingNodes[0].min
           ,computingNodes[0].max
           ,computingNodes[1].min
           ,computingNodes[1].max
           ,func.funName,'min');

        tmpmax = sympleCalculate(
            computingNodes[0].min
           ,computingNodes[0].max
           ,computingNodes[1].min
           ,computingNodes[1].max
           ,func.funName, 'max');

        return {
            tmpmin: tmpmin,
            tmpmax: tmpmax
        }
    }else if(func.mode == 'single' || true){
        let Xs = generateXs(computingNodes[0].min, func.extremes, computingNodes[0].max)
        let Ys = func.computes(Xs)
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
async function buildtree(table,dataCount,columns,tree_index,width, screenStart,screenEnd){

    //console.log('dataCount:',dataCount)

    const path = require('path');
    // 从命令行获取表名
    let tableName = table
    let flagzFileName = `${tableName}_${columns[tree_index]}.flagz`;  // 根据表名自动生成 flagz 文件名
    let flagzFilePath = path.join(__dirname, '../flags', flagzFileName);

    //console.time('readFlagz'); // 开始计时

    //const table_c = readFlagzFile(flagzFilePath);  // 读取并解析 flagz 文件
    const flagBuffer = readFlagz(flagzFilePath);
    const segmentTree = new SegmentTree(tableName,columns,tree_index, flagBuffer,MAXNODENUM); 


    segmentTree.realDataNum = flagBuffer.length

    //!!!!todo 建好tablenum表
    // const querySQL2 = `SELECT dataname,datanum FROM tablenum WHERE dataName = '${tableName}';`;
    // // 从数据库读取数据
    // const result = await pool.query(querySQL2);
    // 如果找到了匹配的行，则将 dataNum 赋值给变量
    //console.log(querySQL2)
    //console.log(result)
    segmentTree.realDataNum = dataCount > 0 ? dataCount : flagBuffer.length;

    //console.timeEnd('readFlagz'); // 结束计时并打印结果


    if (!tableName) {
        console.error("请提供表名作为参数。");
        process.exit(1);
    }

    const level = Math.ceil(Math.log2(width))

    const max_id = 2 ** (level)-1;

    
    //const querySQL = `SELECT i,minvd,maxvd FROM ${tableName}  where i<= ${max_id} ORDER by i ASC`;
    let querySQL = 'SELECT i ' 

    for(let i=0;i<columns.length;i++){
        querySQL = `${querySQL}, minvd_${columns[i]}, maxvd_${columns[i]}, avevd_${columns[i]}`
    }
    
    querySQL = `${querySQL} FROM ${tableName}  where i<= ${max_id} ORDER by i ASC`

    //console.time('read data from DB'); // 开始计时
    //const table_b = await readTableBFromDB(querySQL);  // 从数据库读取表 b
    const table_b = await readTableBFromCache(querySQL, tree_index)
    //console.timeEnd('read data from DB'); // 结束计时并打印结果

    //console.log('table_b',table_b)
    //console.log('table_b_dd',table_b_dd)

    let current_level = [];

    segmentTree.max_level = Math.floor(Math.log2(flagBuffer.length/2)) + 1;  // 树的最大层数

    // 初始化根节点
    let sTime = 0;
    let eTime = flagBuffer.length-1


    // constructor(sTime, eTime, level, index, i, min = 0, max = 0, 
    //  id, minDiff = null, maxDiff = null, leftChild = null, rightChild = null, leftIndex = null, rightIndex = null, parent = null, isBuild=null)

    //const rootNode = segmentTree.addNode(sTime, eTime, 0, 0, 0, table_b[0][1], table_b[0][2], 0, null, null);
    // const rootNode = new SegmentTreeNode(sTime, eTime, 0, 0, 0, table_b[0][1], table_b[0][2], 
    //     0, null, null,null, null, null,null, null, true);
    const rootNode = segmentTree.addNode(sTime, eTime, 0, 0, 0, table_b[0][tree_index*3+ 1], table_b[0][tree_index*3+ 2], table_b[0][tree_index*3+ 3],
        0, null, null,null,null, null, null,null, null, true);
    segmentTree.root = rootNode

    current_level.push(rootNode);

    
   // console.time('build tree Branches'); // 开始计时

    let cnt = 0;  // 节点ID从1开始
    // 从第二行开始遍历表b，逐层构建树，直到构建到第 n+1 层
    for (let i = 1; i < table_b.length; i++) {
        const current_diff_min = table_b[i][tree_index*3+ 1];
        const current_diff_max = table_b[i][tree_index*3+ 2];
        const current_diff_ave = table_b[i][tree_index*3+ 3];
        const parent_node = current_level.shift();



        const level = parent_node.level + 1;  // 层级是父节点层级加1
        const position_in_level = i - (2 ** level);  // 计算i值
        const left_index = 2*parent_node.index + 1;  // 左孩子索引
        const right_index = 2*parent_node.index + 2;  // 右孩子索引

        let { left_node_min, left_node_max, left_node_ave, right_node_min, right_node_max, right_node_ave } = genNodeInfo(current_diff_min, current_diff_max, parent_node, current_diff_ave);


        sTime = parent_node.sTime
        eTime = Math.floor((parent_node.eTime+parent_node.sTime)/2)
        const left_node = segmentTree.addNode(sTime, eTime, level, left_index,   null, left_node_min, left_node_max, left_node_ave,  left_index, 
            null, null, null,null,null, null, null, parent_node, true);
      
        sTime = Math.floor((parent_node.eTime+parent_node.sTime)/2) + 1
        eTime = parent_node.eTime
        const right_node = segmentTree.addNode(sTime, eTime, level, right_index, null, right_node_min, right_node_max, right_node_ave, right_index, 
            null, null,null, null, null, null, null, parent_node, true);

        parent_node.leftIndex = left_index;
        parent_node.rightIndex = right_index;
        parent_node.leftChild = left_node;
        parent_node.rightChild = right_node;

        if (left_node.min !== null || left_node.max !== null) 
            current_level.push(left_node);
        if (right_node.min !== null || right_node.max !== null) 
            current_level.push(right_node);
    }

   // console.timeEnd('build tree Branches'); // 结束计时并打印结果

 
  //  console.time('build tree Leaves'); // 开始计时

    //目前假设树足够深，width较小，因此不会构建到树的叶子层，所以用不到flag。
    if (width > flagBuffer.length / 2) {
        for (let i = 0; i < flagBuffer.length; i += 2) {
            const leftFlag = flagBuffer[i];
            const rightFlag = flagBuffer[i + 1];

            // const parentIndex = flagBuffer.length / 2 - 1 + i / 2;  // 计算对应的父节点索引
            // const parentNode = segmentTree.nodes[parentIndex];

            // 从 current_level 中获取对应的父节点
            if(current_level.length <= i / 2){
                break
            }
            const parentNode = current_level[i / 2];

            if (parentNode == null) {
                continue; // 跳过空的父节点
            }
            const left_index = 2 * parentNode.index + 1;
            const right_index = 2 * parentNode.index + 2;


            // 如果 leftChild 和 rightChild 都为 00
            if (leftFlag === 0 && rightFlag === 0) {

                sTime = parentNode.sTime
                eTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2)

                const leftNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, left_index, null, parentNode.max, parentNode.max, parentNode.max,
                    left_index, null, null,null, null, null, null, null, parentNode, true);

                sTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2) + 1
                eTime = parentNode.eTime
                const rightNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, right_index, null, parentNode.min, parentNode.min, parentNode.min,
                    right_index, null, null,null, null, null, null, null,parentNode, true);
                
                parentNode.leftChild = leftNode;
                parentNode.rightChild = rightNode;
            }
            // 如果 leftChild 和 rightChild 都为 11
            else if (leftFlag === 1 && rightFlag === 1) {

                sTime = parentNode.sTime
                eTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2)

                const leftNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, left_index, null, parentNode.min, parentNode.min, parentNode.min,
                    left_index, null, null,null, null, null, null, null, parentNode, true);

                sTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2) + 1
                eTime = parentNode.eTime
                const rightNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, right_index, null, parentNode.max, parentNode.max, parentNode.max,
                    right_index, null, null,null, null, null, null, null, parentNode, true);
         
                parentNode.leftChild = leftNode;
                parentNode.rightChild = rightNode;
            }
            // 如果 leftChild 为 1，rightChild 为 0
            else if (leftFlag === 1 && rightFlag === 0) {
                sTime = parentNode.sTime
                eTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2)

                const leftNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, left_index, null, parentNode.min, parentNode.max, parentNode.ave*2.0,
                    left_index, null, null,null, null, null, null, null, parentNode, true);
                
                parentNode.leftChild = leftNode;
                parentNode.rightChild = null; // 右子节点为空
            }
            // 如果 leftChild 为 0，rightChild 为 1
            else if (leftFlag === 0 && rightFlag === 1) {

                parentNode.leftChild = null;
                sTime = Math.floor((parentNode.eTime + parentNode.sTime) / 2) + 1
                eTime = parentNode.eTime
                const rightNode = segmentTree.addNode(sTime, eTime, parentNode.level + 1, right_index, null, parentNode.min, parentNode.max, parentNode.ave*2.0,
                    right_index, null, null,null, null, null, null, null, parentNode, true);
               
                parentNode.leftChild = null; // left子节点为空
                parentNode.rightChild = rightNode;
            }
        }


    }



    // let { StartIndex, EndIndex } = getTreeLastSE(segmentTree, width);
    // let computeArrayIndex = [];
    // for(let a = StartIndex;a<=EndIndex;a++){
    //     computeArrayIndex.push(a)
    // }
    // segmentTree.bottonLevelDLL.constructFromList(computeArrayIndex)
    //segmentTree.maxDLL.constructFromList(computeArrayIndex)

    buildDDL(segmentTree, current_level)


   // console.timeEnd('build tree Leaves'); // 结束计时并打印结果

    return segmentTree
}


function genNodeInfo(current_diff_min, current_diff_max, parent_node, current_diff_ave) {
    let left_node_min, right_node_min, left_node_max, right_node_max, left_node_ave, right_node_ave;

    if (current_diff_min === null && current_diff_max === 0) {
        // 左孩子空，右孩子不空
        left_node_min = null;
        left_node_max = null;
        left_node_ave = 0;
        right_node_min = parent_node.min;
        right_node_max = parent_node.max;
        right_node_ave = parent_node.ave * 2.0;
    } else if (current_diff_min === 0 && current_diff_max === null) {
        // 左不空，右空
        left_node_min = parent_node.min;
        left_node_max = parent_node.max;
        left_node_ave = parent_node.ave * 2.0;
        right_node_min = null;
        right_node_max = null;
        right_node_ave = 0;
    } else {
        // 左右diff都空的，表示左右孩子都是空，没有写进数据库；
        //左右diff都是0的，相当于左右都有值，正常处理。
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

        if (current_diff_ave !== null) {
            left_node_ave = parent_node.ave + current_diff_ave / 2;
            right_node_ave = parent_node.ave - current_diff_ave / 2;
        } else {
            left_node_ave = parent_node.ave * 2.0;
            right_node_ave = parent_node.ave * 2.0;
        }


    }
    return { left_node_min, left_node_max, left_node_ave, right_node_min, right_node_max, right_node_ave };
}

function traversalBottom(segmentTree){
    console.log('traversalBottom:',segmentTree.table_name, 'column:',segmentTree.columns[segmentTree.index])

    let node = segmentTree.head

    while(node!=null){
        console.log(
            'st:',node.sTime
            ,'eT:', node.eTime
            // ,'min:', node.min
            // ,'max:', node.max
            ,'ave:',node.ave
            ,'sum:',node.sum
        )
        node=node.nextNode
    }

}

function buildDDL(segmentTree, bottonLevel){

     // 遍历索引列表，构建双向链表
     for (let i = 0; i < bottonLevel.length; i++) {
        const node = bottonLevel[i];


        // 如果是第一个节点，将其设置为头节点
        if (i === 0) {
            segmentTree.head = node;
        }

        // 设置前驱和后继
        if (i > 0) {
            // 前一个节点的NextIndex指向当前节点
            let preNode = bottonLevel[i-1]
            preNode.nextNode = node;
            // 当前节点的preIndex指向前一个节点
            node.preNode = preNode
        }
    }
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

async function getTableBFromDB(segmentTree, indexset){
    

    let querySQL, table_b

    //timestart('nomerge');

    //querySQL = `SELECT i, minvd, maxvd FROM ${segmentTree.table_name} where i in (`;

    querySQL = 'SELECT i ' 

    for(let i=0;i<segmentTree.columns.length;i++){
        querySQL = `${querySQL}, minvd_${segmentTree.columns[i]}, maxvd_${segmentTree.columns[i]}, avevd_${segmentTree.columns[i]}`
    }

    querySQL = `${querySQL} FROM ${segmentTree.table_name}  where i in (`


    for(let a = 0; a < indexset.length - 1; a++){
        querySQL = querySQL.concat(`${indexset[a]}, `);
    }
    querySQL = querySQL.concat(`${indexset[indexset.length - 1]});`);

    table_b = await readTableBFromCache(querySQL,segmentTree.index);

    //let nomergeSpent =  timeend('nomerge');


    // timestart('merge');

    // let WhereCondition = mergeIntervalsForWhereCondition(indexset)
    // //let querySQL = `SELECT i, minvd, maxvd FROM ${segmentTree.table_name} ${WhereCondition} ORDER BY i ASC ;`;
    // querySQL = `SELECT i, minvd, maxvd FROM ${segmentTree.table_name} ${WhereCondition} ;`;
    // table_b = await readTableBFromDB(querySQL);

    // let mergeSpent =  timeend('merge');


    
    // if(mergeSpent > nomergeSpent){
    //     //console.log(querySQL,'\n')
    //     console.log((mergeSpent-nomergeSpent).toFixed(2))
    // }

    //console.log('sql length:',querySQL.length,'\n')

    return table_b

}

function getJoinSql(segmentTrees){

    
        let sql = `select ${segmentTrees[0].table_name}.i as i, `;

        for (let i = 0; i < segmentTrees.length - 1; i++){
            sql = sql.concat(`${segmentTrees[i].table_name}.minvd as minvd${i}, ${segmentTrees[i].table_name}.maxvd as maxvd${i}, `)
        }

        sql = sql.concat(
            `${segmentTrees[segmentTrees.length - 1].table_name}.minvd as minvd${segmentTrees.length - 1}, ${segmentTrees[segmentTrees.length - 1].table_name}.maxvd as maxvd${segmentTrees.length - 1} from ${segmentTrees[0].table_name}`);

        for (let i = 1; i < segmentTrees.length; i++){
            sql = sql.concat(` join ${segmentTrees[i].table_name} on ${segmentTrees[0].table_name}.i = ${segmentTrees[i].table_name}.i `)
        }

        //sql = sql.concat(';')
        //console.log(sql)
        return sql
    


}


async function getTableBFromDBWithJoin(segmentTrees, indexset){
    

    let querySQL, table_b

    //timestart('nomerge');

    querySQL = getJoinSql(segmentTrees)


    querySQL += ` where ${segmentTrees[0].table_name}.i in (`;
    for(let a = 0; a < indexset.length - 1; a++){
        querySQL = querySQL.concat(`${indexset[a]}, `);
    }
    querySQL = querySQL.concat(`${indexset[indexset.length - 1]});`);
    //table_b = await readTableBFromDBWithJoin(querySQL, segmentTrees.length);
    table_b = await pool.query(querySQL);


    // console.log(table_b.rows[0],'\n')
    // let a = Object.values(table_b.rows[0])
    // console.log(a,'\n')
    //let nomergeSpent =  timeend('nomerge');


    // timestart('merge');

    // let WhereCondition = mergeIntervalsForWhereCondition(indexset)
    // //let querySQL = `SELECT i, minvd, maxvd FROM ${segmentTree.table_name} ${WhereCondition} ORDER BY i ASC ;`;
    // querySQL = `SELECT i, minvd, maxvd FROM ${segmentTree.table_name} ${WhereCondition} ;`;
    // table_b = await readTableBFromDB(querySQL);

    // let mergeSpent =  timeend('merge');


    
    // if(mergeSpent > nomergeSpent){
    //        console.log(querySQL,'\n')
    //     console.log((mergeSpent-nomergeSpent).toFixed(2))
    // }

    //console.log('sql length:',querySQL.length,'\n')

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

function buildNode(node, segmentTree, tableb_map, i){

    let parent_node = node.parent

    let index = node.index
    //是否有优化空间，可以不用算
    let {sTime, eTime} = getSETimeByIndex(segmentTree, index);
    node.sTime = sTime
    node.eTime = eTime


    if (!isSingleLeaf(node)) {

        let current_diff_min = tableb_map.get(parent_node.index + 1)[1 + i*2];
        let current_diff_max = tableb_map.get(parent_node.index + 1)[2 + i*2];
        let current_diff_ave = tableb_map.get(parent_node.index + 1)[3 + i*2];
        let { left_node_min, left_node_max, left_node_ave, right_node_min, right_node_max, right_node_ave } = genNodeInfo(current_diff_min, current_diff_max, parent_node, current_diff_ave);

        if (isLeftNode(index)) {
            node.min = left_node_min
            node.max = left_node_max
            node.ave = left_node_ave
        } else {
            node.min = right_node_min
            node.max = right_node_max
            node.ave = right_node_ave
        }


    } else {
        let flag = readFlag(segmentTree, index);
        let left_node_min, left_node_max, left_node_ave, right_node_min, right_node_max, right_node_ave 
        if (flag[0] == 0 && flag[1] == 0) {

            left_node_min = parent_node.max
            left_node_max = parent_node.max
            left_node_ave = parent_node.max
            
            right_node_min = parent_node.min
            right_node_max = parent_node.min
            right_node_ave = parent_node.min

        } else if (flag[0] == 1 && flag[1] == 1) {
            left_node_min = parent_node.min
            left_node_max = parent_node.min
            left_node_ave = parent_node.min
            
            right_node_min = parent_node.max
            right_node_max = parent_node.max
            right_node_ave = parent_node.max
            
        } else if (flag[0] == 1 && flag[1] == 0) {
            left_node_min = parent_node.min
            left_node_max = parent_node.max
            left_node_ave = parent_node.ave*2.0
            
            right_node_min = null
            right_node_max = null
            right_node_ave = null
        } else if (flag[0] == 0 && flag[1] == 1) {
            left_node_min = null
            left_node_max = null
            left_node_ave = null
            
            right_node_min = parent_node.min
            right_node_max = parent_node.max
            right_node_ave = parent_node.ave*2.0
        }

        if (isLeftNode(index)) {
            node.min = left_node_min
            node.max = left_node_max
            node.ave = left_node_ave
        } else {
            node.min = right_node_min
            node.max = right_node_max
            node.ave = right_node_ave
        }

    }

    node.level = parent_node.level + 1
    node.sum = node.ave*(eTime-sTime+1)
    node.isBuild = true

}

function mergeIntervalsForWhereCondition(nums) {
    // 如果列表为空，则返回空数组
    if (nums.length === 0) {
        return [];
    }

    let delta=2

    // // 保存合并后的区间
    // const mergedIntervals = [];
    
    // 初始化第一个区间的开始和结束
    let start = nums[0];
    let end = nums[0];
    let betweenCondition = ' ', inCondition = ' '
    // 遍历数字列表，合并区间
    for (let i = 1; i < nums.length; i++) {
        if (nums[i] <= end + delta) {
            // 如果当前数字与前一个数字连续，则扩展区间
            end = nums[i];
        } else {

            if(end-start >=2){
                betweenCondition += `or (i >= ${start} and i<= ${end}) `
            }else{
                for(let j=start;j<=end;j++){
                    inCondition += `${j},`
                }
            }

            // // 否则，保存当前区间并开始新的区间
            // mergedIntervals.push([start, end]);
            start = nums[i];
            end = nums[i];
        }
    }
    
    // // 添加最后一个区间
    // mergedIntervals.push([start, end]);
    
    if(end-start >=2){
        betweenCondition += `or (i >= ${start} and i<= ${end}) `
    }else{
        for(let j=start;j<=end;j++){
            inCondition += `${j},`
        }
    }

    inCondition = inCondition.slice(0, -1)

    let WhereCondition= ` where i in ( ${inCondition}) ${betweenCondition}`
    
    return WhereCondition;
}


async function Query(needQueryNodes, leaves, segmentTree){
    
     let indexset = [];
     let indexSort = []

    needQueryNodes.sort(function(a, b){return a.index - b.index});





     let parents = []

    //!!!!!todo 待均值计算时再改
    // for(let i=0;i<leaves.length;i++){
    //     let index = leaves[i]
    //     //let parent_index = parentIndex(index);
    //     //如果父节点是空，则需要将其父节点及其祖宗一起查询并构建。
    //     if(segmentTree.nodes[index]==null && !indexset.has(index)){
    //         let route = findRoute(segmentTree, index, indexset);
    //         parents.push(...route)
    //     }
    // }


    if(parents.length>0){
        parents.forEach(item => indexset.add(item));
    }
    if(leaves.length >0){
        leaves.forEach(item => indexset.add(item));
    }

    
    for(let i=0;i<needQueryNodes.length;i++){
        indexset.push(parentIndex(needQueryNodes[i].index)+1)
    }


    //console.log(indexset)
    //去重
    indexset = Array.from(new Set(indexset));
    //console.log(indexset)

    // for(let n=0;n<indexset.length;n++){
    //     console.log(indexset[n])
    // }
    //     let intervals = mergeIntervals(indexset)
    //     //console.log(indexset)
    //     console.log(intervals)
    //  //


 

    //let table_b = await getTableBFromCache(segmentTree,indexArray)
    let table_b = await getTableBFromDB(segmentTree,indexset)


    let tableb_map = new Map();
    let tree_index = segmentTree.index
    table_b.forEach(e =>{
        tableb_map.set(e[0], [e[0], e[tree_index*3+ 1], e[tree_index*3+ 2], e[tree_index*3+ 3]]);
    })

    let v = `${segmentTree.columns[segmentTree.index]}`

let nodes = `${v}:`
    for(let i=0;i<needQueryNodes.length;i++){

        let node = needQueryNodes[i]
        if(node.isBuild){
            continue
        }

        buildNode(node, segmentTree, tableb_map, 0)
        nodes = `${nodes};${node.sTime},${node.eTime}`
        //console.log(node.sTime,node.eTime)
    }

    //console.log(nodes)
}

async function QueryWithJoin(needQueryNodesTrees2, leaves, segmentTrees){
    
    let indexset = [];
    let indexSort = []


    //needQueryNodes.sort(function(a, b){return a.index - b.index});





    let parents = []

   //!!!!!todo 待均值计算时再改
   // for(let i=0;i<leaves.length;i++){
   //     let index = leaves[i]
   //     //let parent_index = parentIndex(index);
   //     //如果父节点是空，则需要将其父节点及其祖宗一起查询并构建。
   //     if(segmentTree.nodes[index]==null && !indexset.has(index)){
   //         let route = findRoute(segmentTree, index, indexset);
   //         parents.push(...route)
   //     }
   // }


   if(parents.length>0){
       parents.forEach(item => indexset.add(item));
   }
   if(leaves.length >0){
       leaves.forEach(item => indexset.add(item));
   }

   

    for (let i = 0; i < needQueryNodesTrees2.length; i++) {
        needQueryNodesTrees2[i].sort(function (a, b) { return a.index - b.index });
    }

    for (let i = 0; i < needQueryNodesTrees2[0].length; i++) {
        indexset.push(parentIndex(needQueryNodesTrees2[0][i].index) + 1)
    }


   //console.log(indexset)
   //去重
   indexset = Array.from(new Set(indexset));
   //console.log(indexset)

   // for(let n=0;n<indexset.length;n++){
   //     console.log(indexset[n])
   // }
   //     let intervals = mergeIntervals(indexset)
   //     //console.log(indexset)
   //     console.log(intervals)
   //  //




timestart('getTableBFromDBWithJoin');
   //let table_b = await getTableBFromCache(segmentTree,indexArray)
   let table_b = await getTableBFromDBWithJoin(segmentTrees, indexset)
timeend('getTableBFromDBWithJoin');

   let tableb_map = new Map();
   table_b.rows.forEach(e =>{
        let row = Object.values(e)
       tableb_map.set(row[0], row);
   })



    for(let i=0;i<segmentTrees.length;i++){
        let segmentTree = segmentTrees[i]
        let needQueryNodes = needQueryNodesTrees2[i]

        for(let j=0;j<needQueryNodes.length;j++){
            let node = needQueryNodes[j]
            if(node.isBuild){
                continue
            }

            buildNode(node, segmentTree, tableb_map,i)

        }
    }


}


//根据indexArray，从数据库中查询到相应的信息，并计算出相应的树节点，分别补充到SegmentTrees中
async function Multi_Query(needQueryNodesTrees,leaves, segmentTrees){

    //timestart('Multi_Query');

    let needQueryNodesTrees2 = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees2.length; i++) {
        needQueryNodesTrees2[i] = [];
    }


    for(let i=0;i<needQueryNodesTrees.length;i++){
        for(let j=0;j<needQueryNodesTrees[i].length;j++){
            let node = needQueryNodesTrees[i][j]
            if(node.isBuild == false){
                needQueryNodesTrees2[i].push(node)
            }
        }

    }
    if(needQueryNodesTrees2[0].length == 0 && leaves.length == 0 ){
        return
    }


    //timestart('Query');
    for(let i = 0; i < needQueryNodesTrees2.length; i++){
        await Query(needQueryNodesTrees2[i], leaves, segmentTrees[i]);
    }
    //timeend('Query');


    // timestart('QueryWithJoin');
    // await QueryWithJoin(needQueryNodesTrees2, leaves, segmentTrees);
    // timeend('QueryWithJoin');


    //timeend('Multi_Query');

}


function getChildren(segmentTree1, parent_node){
    let { leftIndex, rightIndex } = getChildrenIndex(parent_node.index);

    let { sTime:sTime1, eTime:eTime1 } = getSETimeByIndex(segmentTree1, leftIndex);
    let leftChild = segmentTree1.addNode(sTime1, eTime1, parent_node.level+1, leftIndex)
    // leftChild.sTime = sTime1
    // leftChild.eTime = eTime1
    // leftChild.index = leftIndex


    let { sTime:sTime2, eTime:eTime2 } = getSETimeByIndex(segmentTree1, rightIndex);
    let rightChild = segmentTree1.addNode(sTime2, eTime2, parent_node.level+1, rightIndex)
    // rightChild.sTime = sTime2
    // rightChild.eTime = eTime2
    // rightChild.index = rightIndex

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


    let {tmpmin:t1, tmpmax:t2}=unifiedCalulate(segmentTrees, m4.stNodes, func, mode, true)
    m4.st_v = t1

    let {tmpmin:t3, tmpmax:t4}=unifiedCalulate(segmentTrees, m4.etNodes, func, mode, true)
    m4.et_v = t3

}

function getCandidateMinMax(i, screen_m4){
    //timestart('getCandidateMinMax');

    let m4 = screen_m4.M4_array[i]

    //！！！！！对单路计算可以，多路计算，还要考虑其他路情况
    if (m4.alternativeNodesMin.isEmpty()) {
        if (m4.min < screen_m4.candidateMin) {
            screen_m4.candidateMin = m4.min
        }
    } else {
        let Ele = m4.alternativeNodesMin.getTop()
        screen_m4.candidateMin = Math.min(screen_m4.candidateMin, Ele.value, m4.min)
    }

    if (m4.alternativeNodesMax.isEmpty()) {
        if (m4.max > screen_m4.candidateMax) {
            screen_m4.candidateMax = m4.max
        }
    } else {
        let Ele = m4.alternativeNodesMax.getTop()
        screen_m4.candidateMax = Math.max(screen_m4.candidateMax, Ele.value, m4.max)
    }

    //timeend('getCandidateMinMax');
}

async function initM4(segmentTrees,M4_array,func, mode, parallel, screen_m4) {

    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }

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



        if(i == 339){
            debug = true
        }



        //计算边界node
        computeM4ValueSE(M4_array[i], segmentTrees,func, mode)



 


        if (M4_array[i].st_v < M4_array[i].et_v) {
            M4_array[i].min = M4_array[i].st_v
            M4_array[i].max = M4_array[i].et_v

        } else {
            M4_array[i].min = M4_array[i].et_v
            M4_array[i].max = M4_array[i].st_v
        }

        if(M4_array[i].min < screen_m4.exactMin){
            screen_m4.exactMin = M4_array[i].min
        }
        if(M4_array[i].max > screen_m4.exactMax){
            screen_m4.exactMax = M4_array[i].max
        }

        if (M4_array[i].innerNodes.length == 0) {
            M4_array[i].isCompletedMax = true
            M4_array[i].isCompletedMin = true

            continue

        }


        //对一元函数，极值大概率出现在min或max，取该像素列innerNodes的最大和最小
        if(segmentTrees.length == 1){
            initForUnary(M4_array, i, segmentTrees, func, mode);
        }

        //对 max，直接取最大
        if(func.funName == 'max' || func.funName == 'min'){
            initForMaxOrMin(M4_array, i, segmentTrees, func, mode);
        }


        //计算inner node
        //将m4.innerNodes全部放入候选队列
        for(let j=0;j<M4_array[i].innerNodes.length;j++){
            let nodePairs = M4_array[i].innerNodes[j]

            let {tmpmin,tmpmax}=unifiedCalulate(segmentTrees, nodePairs, func, mode, false)
 
            if(tmpmax > M4_array[i].max){
                let max_e = Object.create(element)
                max_e.value=tmpmax
                max_e.nodePairs=nodePairs
                M4_array[i].alternativeNodesMax.add(max_e)
            }

            if(tmpmin < M4_array[i].min){
                let min_e = Object.create(element)
                min_e.value=tmpmin
                min_e.nodePairs=nodePairs
                M4_array[i].alternativeNodesMin.add(min_e)
            }
        }

        //getCandidateMinMax(i,screen_m4)

        //计算的4步：从候选结点取，与m4.max和m4.min比较，赋给Current，获取、查询Current孩子
        let tt = huisuCompute(M4_array[i], segmentTrees, parallel);

        for (let j = 0; j < segmentTrees.length; j++){
            needQueryNodesTrees[j].push(...tt[j])
        }
    }

    // for(let i=0;i<M4_array.length;i++){
    //     calErrorPixM4(i, screen_m4)
    // }



    // if(errorBoundSatisfy(M4_array, 600,600,0)){
    //     //break
    // }

    // for(let i=0;i<M4_array.length;i++){
    //     //计算的4步：从候选结点取，与m4.max和m4.min比较，赋给Current，获取、查询Current孩子
    //     let tt = huisuCompute(M4_array[i], segmentTrees, parallel);
    //     needQueryIndex.push(...tt)
    // }
   


    //上面计算，将要计算的节点currentComputingNodeMax的孩子存储在needQueryIndex中，从数据库查询并计算
    await  Multi_Query(needQueryNodesTrees,[], segmentTrees)
    
}


let errorBoundSatisfyCount =0

class YRange{
    constructor(){
        this.Ymin = Infinity
        this.Ymax = -Infinity
    }
}

function initForMaxOrMin(M4_array, i, segmentTrees, func, mode) {
    let MAX = -Infinity;
    let MIN = Infinity;
    for (let j = 0; j < M4_array[i].innerNodes.length; j++) {
        let nodePairs = M4_array[i].innerNodes[j];
        for(let node of nodePairs){
            let tmpmin = node.min;
            let tmpmax = node.max;
    
            MAX = Math.max(MAX, tmpmax);
            MIN = Math.min(MIN, tmpmin);
        }
    }

    if(func.funName == 'max'){
        M4_array[i].max = Math.max(MAX, M4_array[i].max);
    }else{
        M4_array[i].min = Math.min(MIN, M4_array[i].min);
    }
}

function initForUnary(M4_array, i, segmentTrees, func, mode) {
    let MAX = -Infinity;
    let MIN = Infinity;
    for (let j = 0; j < M4_array[i].innerNodes.length; j++) {
        let nodePairs = M4_array[i].innerNodes[j];
        let tmpmin = nodePairs[0].min;
        let tmpmax = nodePairs[0].max;

        MAX = Math.max(MAX, tmpmax);
        MIN = Math.min(MIN, tmpmin);
    }

    let currentNodes = [];
    let node = new SegmentTreeNode();
    node.min = MIN;
    node.max = MIN;
    currentNodes.push(node);
    let { tmpmin: tmpmin1, tmpmax: tmpmax1 } = unifiedCalulate(segmentTrees, currentNodes, func, mode, true);

    if (tmpmin1 < M4_array[i].min) {
        M4_array[i].min = tmpmin1;
    }

    currentNodes = [];
    node.min = MAX;
    node.max = MAX;
    currentNodes.push(node);
    let { tmpmin: tmpmin2, tmpmax: tmpmax2 } = unifiedCalulate(segmentTrees, currentNodes, func, mode, true);

    if (tmpmax2 > M4_array[i].max) {
        M4_array[i].max = tmpmax2;
    }
}

function getYRangeInner(valuemin,valuemax, ymin,ymax ,height){
    let yRange = new YRange()
    yRange.Ymin = Math.floor( ((valuemin-ymin)/(ymax-ymin))*height )
    yRange.Ymax = Math.floor( ((valuemax-ymin)/(ymax-ymin))*height )

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

        yRange.Ymin = Math.floor( ((intersectionY-ymin)/(ymax-ymin))*height )
        yRange.Ymax = Math.floor( ((m4.st_v-ymin)/(ymax-ymin))*height )

        return yRange

    }else if(m4_pre.et_v > m4.st_v){
        intersectionY = m4.st_v + (m4_pre.et_v-m4.st_v)*(m4.start_time-boundaryPre)/(m4.start_time-m4_pre.end_time)


        yRange.Ymin = Math.floor( ((m4.st_v-ymin)/(ymax-ymin))*height )
        yRange.Ymax = Math.floor( ((intersectionY-ymin)/(ymax-ymin))*height )

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

        yRange.Ymin = Math.floor( ((intersectionY-ymin)/(ymax-ymin))*height )
        yRange.Ymax = Math.floor( ((m4.et_v-ymin)/(ymax-ymin))*height )

        return yRange

    }else if(m4_next.st_v > m4.et_v){
        intersectionY = m4.et_v + (m4_next.st_v-m4.et_v)*(boundaryNext-m4.end_time)/(m4_next.start_time-m4.end_time)

        yRange.Ymin = Math.floor( ((m4.et_v-ymin)/(ymax-ymin))*height )
        yRange.Ymax = Math.floor( ((intersectionY-ymin)/(ymax-ymin))*height )
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
        if (ra.Ymax < bStart || ra.Ymin > bEnd) {

            let newRange = new YRange()
            newRange.Ymax = ra.Ymax
            newRange.Ymin = ra.Ymin
            result.push(newRange);
        } else {
            // 有重叠部分，处理差集
            if (ra.Ymin < bStart) {
                let newRange = new YRange()
                newRange.Ymax = bStart-1
                newRange.Ymin = ra.Ymin
                result.push(newRange);
            }
            if (ra.Ymax > bEnd) {
                let newRange = new YRange()
                newRange.Ymax = ra.Ymax
                newRange.Ymin = bEnd + 1
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
        totalDiffNum += diffRange.Ymax-diffRange.Ymin + 1
    }


    if(debug){
        console.log('union:',unionRanges,'intersection:',intersectionRange)
    }

    return totalDiffNum
}


function getBoundary(start_time,end_time, width, i){

    return (end_time-start_time+1)/width * i
}


function errorBoundSatisfy(screen_m4, width,height,errorBound){
//console.log(width,height,errorBound)
//errorBoundSatisfyCount++

    // if(screen_m4.preError != -1){

    //     if((screen_m4.preError - screen_m4.errorBound)/screen_m4.deltaError > screen_m4.count){
    //         screen_m4.count++
    //         return false
    //     }
    // }

    let M4_array = screen_m4.M4_array
    let totalPixels = width*height

    let errorPixels = 0





    for(let i=0;i<M4_array.length;i++){

        if(M4_array[i].min < screen_m4.exactMin){
            screen_m4.exactMin = M4_array[i].min
        }
        if(M4_array[i].max > screen_m4.exactMax){
            screen_m4.exactMax = M4_array[i].max
        }

        getCandidateMinMax(i,screen_m4)
    }

    for(let i=0;i<M4_array.length;i++){
        calErrorPixM4(i,screen_m4)
        errorPixels+= screen_m4.M4_array[i].errorPixels
    }
    

    errorBoundSatisfyCount++
    console.log(errorBoundSatisfyCount,errorPixels/totalPixels)

    screen_m4.preError = errorPixels/totalPixels
    screen_m4.count = 1

    // if(errorPixels/totalPixels <=0.000001){
    //     let a=0
    // }

    if(errorPixels/totalPixels <= errorBound){
        return true
    }else{
        return false
    }



    return false

    

 
    

     errorBoundSatisfyCount++
     console.log(errorBoundSatisfyCount,errorPixels/totalPixels)

    if(errorPixels/totalPixels <= errorBound){
        return true
    }else{
        return false
    }
    return false





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

function CandidateAsValue(screen_m4, func){
    let M4_array = screen_m4.M4_array
    for(let i=0;i<M4_array.length;i++){
        let m4=M4_array[i]


        let debug = false
        if(i == 108){
            debug = true
        }

        //先计算min
        if (!M4_array[i].isCompletedMin) {

            if(!m4.alternativeNodesMin.isEmpty()){
                let ele = m4.alternativeNodesMin.getTop();
                if(m4.min > ele.value){
                    m4.min = ele.value
                }
            }

            for (let j = 0; j < m4.currentComputingNodeMin.length; j++) {
                let currentComputingNodePairs = m4.currentComputingNodeMin[j]
                let { tmpmin, tmpmax } = unifiedCalulate(null, currentComputingNodePairs, func, null, false)
                if (m4.min > tmpmin) {
                    m4.min = tmpmin
                }
            }

        }

        //再计算max
        if (!M4_array[i].isCompletedMax) {

            if(!m4.alternativeNodesMax.isEmpty()){
                let ele = m4.alternativeNodesMax.getTop();
                if(m4.max < ele.value){
                    m4.max = ele.value
                }
            }

            for (let j = 0; j < m4.currentComputingNodeMax.length; j++) {
                let currentComputingNodePairs = m4.currentComputingNodeMax[j]
                let { tmpmin, tmpmax } = unifiedCalulate(null, currentComputingNodePairs, func, null, false)
                if (m4.max < tmpmax) {
                    m4.max = tmpmax
                }
            }

        }

        //更新candidate Min和Max
        if(screen_m4.candidateMax < m4.max){
            screen_m4.candidateMax = m4.max
        }
        if(screen_m4.candidateMin > m4.min){
            screen_m4.candidateMin = m4.min
        }

    }
}

function finalCompute(screen_m4, func){
    let M4_array = screen_m4.M4_array
    if(M4_array == null){
        return
    }
    
    for(let i=0;i<M4_array.length;i++){
        let m4=M4_array[i]


        let debug = false
        if(i == 8){
            debug = true
        }

        //先计算min
        if (!M4_array[i].isCompletedMin) {
            // if(debug){
            //     console.log(m4.min)
            // }
            //if(m4.currentComputingNodeMin.length == 0){
                if(m4.alternativeNodesMin != null && !m4.alternativeNodesMin.isEmpty()){
                    let ele = m4.alternativeNodesMin.getTop();
                    if(m4.min > ele.value){
                        finalcal_min(ele.nodePairs, func, m4);
                    }
                }
            //}

            for (let j = 0; j < m4.currentComputingNodeMin.length; j++) {
                let currentComputingNodePairs = m4.currentComputingNodeMin[j]
                finalcal_min(currentComputingNodePairs, func, m4);
            }

        }


        //计算max
        if (!M4_array[i].isCompletedMax) {

            //if(m4.currentComputingNodeMax.length == 0){
                if(m4.alternativeNodesMax!= null && !m4.alternativeNodesMax.isEmpty()){
                    let ele = m4.alternativeNodesMax.getTop();
                    if(m4.max < ele.value){
                        finalcal_max(ele.nodePairs, func, m4);
                    }
                }
            //}

            for (let j = 0; j < m4.currentComputingNodeMax.length; j++) {
                let currentComputingNodePairs = m4.currentComputingNodeMax[j]
                finalcal_max(currentComputingNodePairs, func, m4);
            }

        }

        //更新exact Min和Max
        if(screen_m4.exactMax < m4.max){
            screen_m4.exactMax = m4.max
        }
        if(screen_m4.exactMin > m4.min){
            screen_m4.exactMin = m4.min
        }

    }
}

function finalcal_max(currentComputingNodePairs, func, m4) {
    if (isSingleLeaf(currentComputingNodePairs[0])) {
        let { tmpmin, tmpmax } = unifiedCalulate(null, currentComputingNodePairs, func, null, true);
        if (m4.max < tmpmax) {
            m4.max = tmpmax;
        }

    } else {
        let { tmpmin, tmpmax } = unifiedCalulate(null, currentComputingNodePairs, func, null, false);
        if (m4.max < tmpmax) {
            m4.max = (m4.max + tmpmax) / 2;
        }
    }
}

function finalcal_min(currentComputingNodePairs, func, m4) {
    if (isSingleLeaf(currentComputingNodePairs[0])) {
        let { tmpmin, tmpmax } = unifiedCalulate(null, currentComputingNodePairs, func, null, true);
        if (m4.min > tmpmin) {
            m4.min = tmpmin;
        }

    } else {
        let { tmpmin, tmpmax } = unifiedCalulate(null, currentComputingNodePairs, func, null, false);
        if (m4.min > tmpmin) {
            m4.min = (m4.min + tmpmin) / 2;
        }
    }
}

//mode = single/multi
async function Start_Multi_Compute(segmentTrees,screen_m4,func, mode, parallel, width,height,errorBound){

    let M4_array = screen_m4.M4_array

    //console.time('initM4');
    await initM4(segmentTrees,M4_array,func, mode, parallel, screen_m4)
    //console.timeEnd('initM4');

    let needQueryIndex = []

    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }


    //经过上面的处理，以及Multi_Query后，每个像素列m4里，当前要计算的节点currentComputingNodeMax，及其孩子已经查询计算得到。
    //下面开始根据currentComputingNodeMax对左右孩子进行计算
    let computedMinCount = 0
    let computedMaxCount = 0
    let computedCount = 0
    while(computedCount < M4_array.length*2 ){
        // if (timelimit < 10) {
        //     //表示用了timelimit限制，就不做errorbound了
        //     let currentTime = performance.now() / 1000.0;
        //     if (currentTime - procesStartTime > timelimit) {
        //         console.log('time exist:', currentTime - procesStartTime)
        //         errorBoundSatisfy(screen_m4, width, height, errorBound)
        //         break
        //     }
        // } else 
        {
            timestart('errorBoundSatisfy');
            if (hasPixExact) 
            {
                hasPixExact = false
                if (errorBoundSatisfy(screen_m4, width, height, errorBound)) {
                    let brk = true
                    break
                }
            }
            timeend('errorBoundSatisfy');
        }
        // if (isMemLimit && segmentTrees[0].nodeCount > segmentTrees[0].maxNodeNum) {
        //     reduceNodes(segmentTrees,computeColumns, screen_m4)
        // }

            
        //console.log(computedCount)
        computedCount = 0
        // screen_m4.exactMax=-Infinity
        // screen_m4.exactMin=Infinity
        // screen_m4.candidateMax=-Infinity
        // screen_m4.candidateMin=Infinity
        


        for(let i=0;i<M4_array.length;i++){


            if(i == 15){
                debug = true 
            }else{
                debug=false
            }

            //先计算min
            if(M4_array[i].isCompletedMin){
                // to repair,bug
                computedCount++
                //console.log(computedCount)
            }
            else{
                //对M4_array[i]的Current进行计算
                CurrentCompute(M4_array[i], segmentTrees,func, 'min', mode, screen_m4, i)
            }
            
            //计算max
            if(M4_array[i].isCompletedMax){
                computedCount++
                //console.log(computedCount)
            }else{
                //对M4_array[i]的Current进行计算
                CurrentCompute(M4_array[i], segmentTrees,func, 'max', mode, screen_m4, i)
            }

            if(M4_array[i].isCompletedMin && M4_array[i].isCompletedMax){
                M4_array[i].errorPixels = 0
            }



            // let tt = huisuCompute(M4_array[i], segmentTrees, parallel);
            // needQueryIndex.push(...tt)

        }
        



 

        screen_m4.candidateMax=-Infinity
        screen_m4.candidateMin=Infinity
        for(let i=0;i<M4_array.length;i++){
            // if(i == 249){
            //     debug = true 
            // }else{
            //     debug=false
            // }

            let tt = huisuCompute(M4_array[i], segmentTrees, parallel);
            for (let j = 0; j < segmentTrees.length; j++){
                needQueryNodesTrees[j].push(...tt[j])
            }
            //needQueryIndex.push(...tt)
        }




        //经过上面的for循环，相当于对m4像素列遍历了一遍，也就是对每个m4的 当前计算节点进行了计算，并把其左右孩子放入候选堆，
        //然后通过huisu，取出候选堆中的最优节点，并找到其孩子的index放入needQuery中
        await Multi_Query(needQueryNodesTrees,[], segmentTrees)
        for (let j = 0; j < segmentTrees.length; j++){
            needQueryNodesTrees[j] = []
        }
        //needQueryIndex = []       
    }

    if(computedCount >= M4_array.length*2){
        errorBoundSatisfy(screen_m4, width, height, errorBound)
    }
}


function calErrorPixM4(i, screen_m4){
    //timestart('calErrorPixM4');

    let M4_array=screen_m4.M4_array
    let m4=screen_m4.M4_array[i]
    let m4_pre = null
    let m4_next = null
    let boundaryPre = M4_array[0].start_time
    let boundaryNext = M4_array[M4_array.length-1].end_time

    if(i >0){
        m4_pre = M4_array[i-1]
        boundaryPre = getBoundary(M4_array[0].start_time,M4_array[M4_array.length-1].end_time, screen_m4.width, i)
    }
    if(i<M4_array.length-1){
        m4_next= M4_array[i+1]

        boundaryNext = getBoundary(M4_array[0].start_time,M4_array[M4_array.length-1].end_time, screen_m4.width, i+1)
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

    m4.errorPixels = computeErrorPixels(m4_pre,boundaryPre,m4,m4_next,boundaryNext 
        ,screen_m4.exactMax,screen_m4.exactMin,screen_m4.candidateMax,screen_m4.candidateMin, screen_m4.height, false)


    //timeend('calErrorPixM4');
}

let hasPixExact = false

function CurrentCompute(m4, segmentTrees,func, destination, mode, screen_m4, M4_i){


    // for min=========================================
    for (let i = 0; destination == 'min' && i < m4.currentComputingNodeMin.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMin[i]
        let currentComputingNodePairs = m4.currentComputingNodeMin[i]

        //表示该节点已经被删除了
        if(currentComputingNodePairs[0].isBuild == false){
            m4.currentComputingNodeMin[i] = null
            continue
        }

        //当前需要计算的节点是叶子结点, 则直接进行计算，并结束，不需要向下查询
        if (isSingleLeaf(currentComputingNodePairs[0])) {

            // if(debug){
            //     debug = true
            // }

            //对叶子节点：step1：计算，step2：与当前比较，step3：赋给当前值；step4：返回null（因没有孩子，不需要向下查询）

            //step1

            let { tmpmin, tmpmax } = unifiedCalulate(segmentTrees, currentComputingNodePairs, func, mode, true)
            //step2
            if (tmpmin < m4.min) {
                //step3
                m4.min = tmpmin

                // //更新exactMin
                // if(m4.min < screen_m4.exactMin){
                //     screen_m4.exactMin=m4.min
                // }

                // //计算m4的ErrorPix
                // calErrorPixM4(M4_i, screen_m4)
                hasPixExact = true
            }
            m4.currentComputingNodeMin[i] = null
            //step4
            //return []

            //顺便也更新一下max
            if(tmpmax > m4.max){
                m4.max = tmpmax
                hasPixExact = true
            }

        } else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以min为例，
            // 小于m4当前的min的，小的给Current，大的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 大于当前的max的，不管了
            // 如果都大于m4当前的min，则该节点fail了，不需要往下，


            let leftNodes = [], rightNodes = []
            for(let j=0;j<segmentTrees.length;j++){
                leftNodes.push(currentComputingNodePairs[j].leftChild)
                rightNodes.push(currentComputingNodePairs[j].rightChild)

                //currentComputingNodePairs 可以删除了
                segmentTrees[j].deleteNode(currentComputingNodePairs[j])
            }

            let { tmpmin: minLeft, tmpmax: maxLeft } = unifiedCalulate(segmentTrees, leftNodes, func, mode, false)
            let { tmpmin: minRight, tmpmax: maxRight } = unifiedCalulate(segmentTrees, rightNodes, func, mode, false)
            let ele = Object.create(element)


            //左右孩子都小于m4当前的min的
            if (minLeft < m4.min && minRight < m4.min) {
                // 小的给Current，大的进alternative
                if (minLeft < minRight) {
                    currentComputingNodePairs = leftNodes
                    ele.nodePairs = rightNodes
                    ele.value = minRight
                } else {
                    currentComputingNodePairs = rightNodes
                    ele.nodePairs = leftNodes
                    ele.value = minLeft
                }
                m4.alternativeNodesMin.add(ele)

            }
            // 只有1边小于m4当前的min的
            else if (minLeft < m4.min || minRight < m4.min) {
                // 小的给Current，小的不管
                if (minLeft < minRight) {
                    currentComputingNodePairs = leftNodes
                } else {
                    currentComputingNodePairs = rightNodes
                }
            }
            // 如果都小于m4当前的min，则该节点fail了，不需要往下，
            else {
                currentComputingNodePairs = null
            }
            m4.currentComputingNodeMin[i] = currentComputingNodePairs


            //同时看一下max的candidate
            if(maxLeft > m4.max){
                let ele2 = Object.create(element)
                ele2.nodePairs = leftNodes
                ele2.value = maxLeft
                m4.alternativeNodesMax.add(ele2)
            }
            if(maxRight > m4.max){
                let ele2 = Object.create(element)
                ele2.nodePairs = rightNodes
                ele2.value = maxRight
                m4.alternativeNodesMax.add(ele2)
            }
        }
    }


    // for Max=========================================
    for (let i = 0; destination == 'max' && i < m4.currentComputingNodeMax.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMax[i]
        let currentComputingNodePairs = m4.currentComputingNodeMax[i]
        //表示该节点已经被删除了
        if(currentComputingNodePairs[0].isBuild == false){
            m4.currentComputingNodeMax[i] = null
            continue
        }
        //当前需要计算的节点是叶子结点, 则直接进行计算，并结束，不需要向下查询
        if (isSingleLeaf(currentComputingNodePairs[0])) {
            //对叶子节点：step1：计算，step2：与当前比较，step3：赋给当前值；step4：返回null（因没有孩子，不需要向下查询）

            //step1

            let { tmpmin, tmpmax } = unifiedCalulate(segmentTrees, currentComputingNodePairs, func, mode, true)
            //step2
            if (tmpmax > m4.max) {
                //step3
                m4.max = tmpmax

                // //更新exactMax
                // if(m4.max < screen_m4.exactMax){
                //     screen_m4.exactMax=m4.max
                // }

                // //计算m4的ErrorPix
                // calErrorPixM4(M4_i, screen_m4)
                hasPixExact = true
            }
            m4.currentComputingNodeMax[i] = null
            //step4
            //return []

            //顺便也更新一下min
            if(tmpmin < m4.min){
                m4.min = tmpmin
                hasPixExact = true
            }

        } else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以max为例，
            // 大于m4当前的max的，大的给Current，小的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 小于当前的max的，不管了
            // 如果都小于m4当前的max，则该节点fail了，不需要往下，

            let leftNodes = [], rightNodes = []
            for(let j=0;j<segmentTrees.length;j++){
                leftNodes.push(currentComputingNodePairs[j].leftChild)
                rightNodes.push(currentComputingNodePairs[j].rightChild)

                //currentComputingNodePairs 可以删除了
                segmentTrees[j].deleteNode(currentComputingNodePairs[j])
            }

            

            let { tmpmin: minLeft, tmpmax: maxLeft } = unifiedCalulate(segmentTrees, leftNodes, func, mode, false)
            let { tmpmin: minRight, tmpmax: maxRight } = unifiedCalulate(segmentTrees, rightNodes, func, mode, false)
            let ele = Object.create(element)


            //左右孩子都大于m4当前的max的
            if (maxLeft > m4.max && maxRight > m4.max) {
                // 大的给Current，小的进alternative
                if (maxLeft > maxRight) {
                    currentComputingNodePairs = leftNodes
                    ele.nodePairs = rightNodes
                    ele.value = maxRight
                } else {
                    currentComputingNodePairs = rightNodes
                    ele.nodePairs = leftNodes
                    ele.value = maxLeft
                }
                m4.alternativeNodesMax.add(ele)

            }
            // 只有1边大于m4当前的max的
            else if (maxLeft > m4.max || maxRight > m4.max) {
                // 大的给Current，小的不管
                if (maxLeft > maxRight) {
                    currentComputingNodePairs = leftNodes
                } else {
                    currentComputingNodePairs = rightNodes
                }
            }
            // 如果都小于m4当前的max，则该节点fail了，不需要往下，
            else {
                currentComputingNodePairs = null
            }
            m4.currentComputingNodeMax[i] = currentComputingNodePairs


            //同时看一下min的candidate
            if(minLeft < m4.min){
                let ele2 = Object.create(element)
                ele2.nodePairs = leftNodes
                ele2.value = minLeft
                m4.alternativeNodesMin.add(ele2)
            }
            if(minRight < m4.min){
                let ele2 = Object.create(element)
                ele2.nodePairs = rightNodes
                ele2.value = minRight
                m4.alternativeNodesMin.add(ele2)
            }
        }
    }


    //删除null
    
    if (destination == 'min') {
        //console.log(m4.currentComputingNodeMin)
        // for(item of m4.currentComputingNodeMin){
        //     if(item != null){
        //         console.log(item[0].isBuild)
        //         if(item[0].isBuild == false){
        //             console.log(item[0].isBuild)
        //         }
        //     }
        // }

        m4.currentComputingNodeMin = m4.currentComputingNodeMin.filter(item => item != null && item[0].isBuild != false);
    } else {
        //console.log(m4.currentComputingNodeMax)
        // for(item of m4.currentComputingNodeMax){
        //     if(item != null){
        //         console.log(item[0].isBuild)
        //         if(item[0].isBuild == false){
        //             console.log(item[0].isBuild)
        //         }
        //     }
        // }

        m4.currentComputingNodeMax = m4.currentComputingNodeMax.filter(item => item != null && item[0].isBuild != false);
    }


}

function connotdelete(node, m4){
    //console.log(m4)
    //1、m4的边界节点
    if(node.sTime == m4.start_time 
        || node.sTime == m4.end_time 
        || node.eTime == m4.end_time 
        || node.eTime == m4.end_time){
        return true
    }

    if(node.nextNode == null){
        return true
    }


    //2、与兄弟节点不同时在bottom
    if(node.parent.sTime != node.nextNode.parent.sTime){
        return true
    }

    return false
}

function selectBottomNodesToDelete(segmentTrees,computeColumns, screen_m4, need2reduce){
    let M4_array = screen_m4.M4_array
    let nodes = []
    let m4_index = 0
    let m4 = M4_array[m4_index]

    for (let i = 0; i < segmentTrees.length; i++) {
        nodes.push(segmentTrees[i].head)
    }

    let maxdistance = -Infinity
    
    while(nodes[0] != null && need2reduce >0){
        if(connotdelete(nodes[0], m4)){
            for(let i = 0; i < segmentTrees.length; i++){
                nodes[i] = nodes[i].nextNode

                //保证当前node与m4 同步
                if(nodes[0].sTime > m4.end_time){
                    m4_index ++
                    if(m4_index >= M4_array.length){
                        return
                    }
                    m4 = M4_array[m4_index]
                }
            }
            continue
        }

        let nextNodes = []
        for(let i = 0; i < segmentTrees.length; i++){
            nextNodes.push(nodes[i].nextNode)
        }

        let { tmpmin: tmpmin1, tmpmax: tmpmax1 } = unifiedCalulate(segmentTrees, nodes, segmentTrees[0].funInfo, null, isSingleLeaf(nodes[0]))

        let { tmpmin: tmpmin2, tmpmax: tmpmax2 } = unifiedCalulate(segmentTrees, nextNodes, segmentTrees[0].funInfo, null, isSingleLeaf(nextNodes[0]))

        //只要不是边界节点，两个节点一定在同一个M4中

        //当前节点或兄弟节点，存在比m4的exact更优情况，则不能删。
        if(m4.min > Math.min(tmpmin1,tmpmin2) || m4.max<Math.max(tmpmax1,tmpmax2)){
            for(let i = 0; i < segmentTrees.length; i++){
                nodes[i] = nodes[i].nextNode
            }

            //保证当前node与m4 同步
            if(nodes[0].sTime > m4.end_time){
                m4_index ++
                if(m4_index >= M4_array.length){
                    return
                }
                m4 = M4_array[m4_index]
            }
            continue
        }

        //可以删除
        let toDelete = []
        for(let i = 0; i < segmentTrees.length; i++){
            let parent = segmentTrees[i].buildParent(nodes[i], nodes[i].nextNode)
            if(parent == null){
                break
            }
            //更新双向链表
            parent.preNode = nodes[i].preNode
            parent.nextNode = nodes[i].nextNode.nextNode
            if(parent.preNode != null){
                parent.preNode.nextNode=parent
            }else{
                segmentTrees[i].head = parent
            }
            if(parent.nextNode != null){
                parent.nextNode.preNode=parent
            }

            toDelete.push(nodes[i])
            toDelete.push(nodes[i].nextNode)

            //不需要更新m4，parent一定在当前m4内
            nodes[i]=parent
        }


        for(let i = 0; i < toDelete.length; i++){
            segmentTrees[Math.floor(i/2)].deleteNode(toDelete[i])
        }
    }

}

function getPredictNodeNum(segmentTrees, screen_m4){
    let M4_array = screen_m4.M4_array
    let predictNodeNum = 0
    for(let m4 of M4_array){
        if(m4.currentComputingNodeMin.length!=0 && m4.currentComputingNodeMin[0][0]!=null){
            predictNodeNum += segmentTrees[0].max_level - m4.currentComputingNodeMin[0][0].level
        }

        //console.log(m4.currentComputingNodeMax)
        if(m4.currentComputingNodeMax.length!=0 && m4.currentComputingNodeMax[0][0]!=null){
            predictNodeNum += segmentTrees[0].max_level - m4.currentComputingNodeMax[0][0].level
        }
    }

    return predictNodeNum

}

function reduceNodes(segmentTrees,computeColumns, screen_m4){

    //console.log("segmentTrees[0].nodeCount , segmentTrees[0].maxNodeNum",segmentTrees[0].nodeCount > segmentTrees[0].maxNodeNum)

    let before = segmentTrees[0].nodeCount


    for (let i = 0; i < segmentTrees.length; i++) {
        segmentTrees[i].deleteAllParents()
    }


    let existNodeNum = segmentTrees[0].nodeCount
    let predictNodeNum = getPredictNodeNum(segmentTrees, screen_m4)
    let maxNodeNum = segmentTrees[0].maxNodeNum
    let need2reduce = existNodeNum+predictNodeNum - maxNodeNum
    if(segmentTrees[0].head == null){
        console.log("head = null")
        return
    }

    if(need2reduce > 0){
        selectBottomNodesToDelete(segmentTrees,computeColumns, screen_m4, need2reduce)
    }
    let after = segmentTrees[0].nodeCount

    console.log('segmentTrees[0].maxNodeNum',segmentTrees[0].maxNodeNum,'before delete node num:',before,'after delete node num:',after)

}

function fenlieChildrens(segmentTrees, fenlieNodes, needQueryNodesTrees, m4) {

    if(fenlieNodes[0].leftChild != null && fenlieNodes[0].rightChild != null){
        return
    }

    for (let i = 0; i < segmentTrees.length; i++) {


        let { leftChild, rightChild } = getChildren(segmentTrees[i], fenlieNodes[i]);

        needQueryNodesTrees[i].push(leftChild);
        needQueryNodesTrees[i].push(rightChild);


        fenlieNodes[i].leftChild = leftChild;
        fenlieNodes[i].rightChild = rightChild;
        leftChild.parent = fenlieNodes[i];
        rightChild.parent = fenlieNodes[i];

        //更新双向链表
        leftChild.preNode = fenlieNodes[i].preNode;
        leftChild.nextNode = rightChild;
        rightChild.preNode = leftChild;
        rightChild.nextNode = fenlieNodes[i].nextNode;

        if(leftChild.preNode != null){
            leftChild.preNode.nextNode = leftChild
        }
        if(rightChild.nextNode != null){
            rightChild.nextNode.preNode = rightChild
        }

        if (segmentTrees[i].head.index == fenlieNodes[i].index) {
            segmentTrees[i].head = leftChild;
        }

        // if(segmentTrees[i].patentDelete){
        //     segmentTrees[i].deleteNode(fenlieNodes[i])
        // }

    }

    // if(segmentTrees[0].nodeCount > segmentTrees[0].maxNodeNum){
    //     reduceNodes(segmentTrees, m4)
    // }
}

//总结：计算的4步：step1:从候选结点取，step2:与m4.max和m4.min比较，step3:赋给Current，step4:取Current孩子
function huisuCompute(m4, segmentTrees, parallel) {
    let needQueryIndex = []
    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }


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
                    if(MaxEle.nodePairs[0].isBuild == false){
                        //表示该节点已经被删除了
                        continue
                    }
                    //step3 !!!!!todo,可以把整个ele放进去，这个CurrentCompute就有了candidate值。
                    m4.currentComputingNodeMax.push(MaxEle.nodePairs);
                }else{
                    // 堆顶不如当前m4，那么alternativeNodesMax里其他的都fail了，把alternative 清空
                    m4.alternativeNodesMax = new MaxHeap()  //后续改为清空函数
                    break
                }
            }

            if(m4.currentComputingNodeMax.length == 0){
                m4.isCompletedMax = true
            }

            
        }
    }

    if (!m4.isCompletedMax && m4.currentComputingNodeMax.length != 0) {

        for(let i = 0;i<m4.currentComputingNodeMax.length;i++){
            let nodePairs = m4.currentComputingNodeMax[i]
            //对叶子结点，不需要取其孩子。
            if (!isSingleLeaf(nodePairs[0])) {
                //step4
                fenlieChildrens(segmentTrees, nodePairs, needQueryNodesTrees, m4)
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
                    if(MinEle.nodePairs[0].isBuild == false){
                        //表示该节点已经被删除了
                        continue
                    }
                    //step3
                    m4.currentComputingNodeMin.push(MinEle.nodePairs);
                }else{
                    // 堆顶不如当前m4，那么alternativeNodesMin里其他的都fail了，把alternative 清空
                    m4.alternativeNodesMin = new MinHeap()  //后续改为清空函数
                    break
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

            let nodePairs = m4.currentComputingNodeMin[i]
            //对叶子结点，不需要取其孩子。
            if (!isSingleLeaf(nodePairs[0])) {
                //step4
                fenlieChildrens(segmentTrees, nodePairs, needQueryNodesTrees, m4)
            }

        }
    }


    return needQueryNodesTrees



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

function getInterval(globalStart,globalEnd, time, range, minTime, maxTime){
    
    let eTime = globalStart +  range* Math.ceil((time-globalStart+1)/range) - 1
    let sTime = eTime - range + 1 

    let interval = new Interval(sTime,eTime, minTime, maxTime)

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
        this.head = null; // 链表的头节点
    }

    // 构建双向链表的方法，从传入的索引列表创建链表
    constructFromList(indexList) {

        // 清空现有的链表
        this.nodes = {};

        // 遍历索引列表，构建双向链表
        for (let i = 0; i < indexList.length; i++) {
            const currentIndex = indexList[i];


            // 创建当前节点并添加到字典
            const newNode = new Node(currentIndex);
            this.nodes[currentIndex] = newNode;

            // 如果是第一个节点，将其设置为头节点
            if (i === 0) {
                this.head = newNode;
            }

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
            }else {
                // 如果当前节点是头节点，将新节点设置为头节点
                this.head = newNode;
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
        }else {
            // 如果要删除的是头节点，将下一个节点设置为头节点
            this.head = this.nodes[currentNode.NextIndex] || null;
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

    let leftChild = segmentTree1.addNode()
    let { sTime:sTime1, eTime:eTime1 } = getSETimeByIndex(segmentTree1, leftIndex);
    leftChild.sTime = sTime1
    leftChild.eTime = eTime1
    leftChild.index = leftIndex

    let rightChild = segmentTree1.addNode()
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
    return stInterval.start_time == etInterval.start_time && stInterval.end_time == etInterval.end_time

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


function buildIntervals(screen_m4){
    //let M4_array = computeM4TimeSE(width, [screenStart, screenEnd])
    let intervalArray = []
    // let sTime = Math.floor(
    //     (screen_m4.globalIntervalStartTime - screen_m4.screenStartTimestamp)/screen_m4.dataDelta
    // )

    let sTime = screen_m4.globalIntervalStart

    let eTime = sTime + screen_m4.intervalLength - 1
    while(eTime <= screen_m4.globalIntervalEnd + screen_m4.intervalLength - 1){


        let interval = new Interval(sTime, eTime, 0, screen_m4.dataCont-1)
        intervalArray.push(interval)

        sTime=eTime+1
        eTime = sTime + screen_m4.intervalLength - 1
    }

    return intervalArray
}

function isContainForInterval(node, interval){
    //是叶子节点
    
    if(isSingleLeaf(node)){
        switch(true){
            case node.eTime < interval.start_time:
                return -1;break; //Node在M4左边；
                
            case node.sTime >= interval.start_time && node.sTime <= interval.end_time:
                return -3;break;//Node在M4内部；
                
            case node.sTime > interval.end_time:
                return -5;break;//Node在M4右边；
            default:
                return 0;break;
        }
    }
    else{//非叶子节点
        switch(true){
            //Node完全在M4的左边；
            case node.eTime < interval.start_time:
                return 1;break;


            //Node一部分在M4左边，一部分在M4内；
            case node.sTime < interval.start_time  && node.eTime >= interval.start_time :
                return 3;break;


            //Node在M4内部；
            case node.sTime >= interval.start_time && node.eTime <= interval.end_time:
                return 5; break;

            //Node跨过M4右边界；
            case  node.sTime <= interval.end_time && node.eTime > interval.end_time :
                return 7; break;

            //Node完全在M4的右边；
            case node.sTime > interval.end_time:
                return 9; break;
            default:
                return 0;break;
        }
    }
}


async function fenlieByInterval(intervalArrays,screenStart,screenEnd,segmentTrees){
    let currentNodes = []
    for(let i=0;i<segmentTrees.length;i++){
        currentNodes.push(segmentTrees[i].head)
    }

    if(currentNodes.length == 0){
        //error
        return
    }

    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }
 
    let i = 0;
    while (i < intervalArrays[0].length && currentNodes[0] != null) {

        let interval = intervalArrays[0][i]
        let type = isContainForInterval(currentNodes[0], interval);
        //对叶子结点
        if (type == -1) {
            for (let i = 0; i < segmentTrees.length; i++) {
                currentNodes[i] = currentNodes[i].nextNode
            }

            continue;
        }


        //叶子Node在M4内部，放到该M4的inner中
        if (type == -3 ) {
            //let nodePairs = []
            for (let k = 0; k < segmentTrees.length; k++) {
                //nodePairs.push(currentNodes[i])
                intervalArrays[k][i].nodes.push([currentNodes[k]])
                currentNodes[k] = currentNodes[k].nextNode

            }
            continue;
        }


        if (type == -5) {
            i++
            continue;
        }

        if (type == 1) {
            //cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            for (let k = 0; k < segmentTrees.length; k++) {
                currentNodes[k] = currentNodes[k].nextNode
            }
            continue;
        }

        //要进行分裂
        if (type == 3 || type == 7) {
            // 对非叶子节点，分裂其左右孩子
            fenlieChildrens(segmentTrees, currentNodes, needQueryNodesTrees, interval)
            for (let k = 0; k < segmentTrees.length; k++) {
                currentNodes[k] = currentNodes[k].leftChild
            }
            continue;
        }

        // 对非叶子节点，如果该node完全包含在M4内部，则不需要分裂，而是仅仅将该node加入到M4的innerNodes中即可。
        if (type == 5) {
            for (let k = 0; k < segmentTrees.length; k++) {
                intervalArrays[k][i].nodes.push([currentNodes[k]])
                currentNodes[k] = currentNodes[k].nextNode
            }
            continue;
        }
        if (type === 9) {
            i++;
            continue;
        }
    }

    //对computeArrayUnqueryIndex进行查询，并加到computeArray中。
    let tempArrayIndex = await Multi_Query(needQueryNodesTrees, [], segmentTrees);
}

function intervalCalculation(interval,func){

    if(func.funName == 'sum' && interval.sum!= null){
        return interval.sum
    }else if(func.funName == 'ave' && interval.ave!=null){
        return interval.ave
    }

    let r = 0

    for(let node of interval.nodes){
        r += node[0].sum
    }   

    interval.sum = r
    interval.ave = r/(interval.end_time -interval.start_time +1.0)

    if(func.funName == 'sum'){
        return interval.sum
    }else if(func.funName == 'ave'){
        return interval.ave
    }
}

function relationship(interval, m4){
    switch(true){
        //interval完全在M4的左边；
        case interval.end_time < m4.start_time:
            return 1;break;


        //interval一部分在M4左边，一部分在M4内, 但interval没有完全占领m4；
        case interval.start_time <= m4.start_time  
        && interval.end_time >= m4.start_time 
        &&  interval.end_time < m4.end_time:
            return 2;break;

        //interval在M4内部,且不与m4右边界相交；
        case interval.start_time > m4.start_time 
        && interval.end_time < m4.end_time:
            return 3; break;

        //interval一部分在M4右边，一部分在M4内, 但interval没有完全占领m4；
        case interval.start_time > m4.start_time 
        && interval.start_time <= m4.end_time
        && interval.end_time >= m4.end_time:
            return 4; break;

        //interval比较大，完全包含了m4
        case interval.start_time <= m4.start_time 
        && interval.end_time >= m4.end_time:
            return 5; break;

        //interval完全在M4的右边；
        case interval.start_time > m4.end_time:
            return 9; break;
        default:
            return 0;break;
    }
}

function initM4ByInterval(screen_m4, intervalArrays, func){
    let M4_array = screen_m4.M4_arrays[0]

    let m=0,i=0
    while(m<M4_array.length && i<intervalArrays[0].length){
        let m4 = M4_array[m], interval = intervalArrays[0][i]
        m4.isCompletedMax = true
        m4.isCompletedMin = true

        let type = relationship(interval, m4)

        if(m==198){
            debug = true
        }


        if (type == 1) {
            i++
            continue;
        }

        if(type == 2){
            for(let k=0;k<intervalArrays.length;k++){
                let r = intervalCalculation(intervalArrays[k][i],screen_m4.func)
                let m4 = screen_m4.M4_arrays[k][m]
                m4.isCompletedMax = true
                m4.isCompletedMin = true

                m4.st_v = r
                if(m4.max < r){
                    m4.max = r
                }
                if(m4.min > r){
                    m4.min = r
                }
            }

            
            i++
            continue
        }

        if(type == 3){

            for(let k=0;k<intervalArrays.length;k++){
                let r = intervalCalculation(intervalArrays[k][i],screen_m4.func)
                let m4 = screen_m4.M4_arrays[k][m]
                m4.isCompletedMax = true
                m4.isCompletedMin = true

                if(m4.max < r){
                    m4.max = r
                }
                if(m4.min > r){
                    m4.min = r
                }
            }
            
            i++
            continue
        }

        if(type == 4){
            for(let k=0;k<intervalArrays.length;k++){
                let r = intervalCalculation(intervalArrays[k][i],screen_m4.func)
                let m4 = screen_m4.M4_arrays[k][m]
                m4.isCompletedMax = true
                m4.isCompletedMin = true

                m4.et_v = r
                if(m4.max < r){
                    m4.max = r
                }
                if(m4.min > r){
                    m4.min = r
                }
            }
            
            m++
            continue
        }

        if(type == 5){

            for(let k=0;k<intervalArrays.length;k++){
                let r = intervalCalculation(intervalArrays[k][i],screen_m4.func)
                let m4 = screen_m4.M4_arrays[k][m]
                m4.isCompletedMax = true
                m4.isCompletedMin = true
                m4.st_v = r
                m4.et_v = r
                if(m4.max < r){
                    m4.max = r
                }
                if(m4.min > r){
                    m4.min = r
                }
            }
            m++
            continue
        }

        if (type == 9) {
            m++
            continue;
        }
    }
}

// 获取指定时间戳所在小时的下一小时的开始时间（HH:00:00.000）
function getStartOfNextHour(timestamp) {
    const date = new Date(timestamp*1000);
    date.setHours(date.getHours() + 1); // 调整到下一小时
    date.setMinutes(0, 0, 0); // 设置为 HH:00:00.000
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在小时的上一小时的结束时间（HH:59:59.999）
function getEndOfPreviousHour(timestamp) {
    const date = new Date(timestamp*1000);
    date.setHours(date.getHours() - 1); // 调整到上一小时
    date.setMinutes(59, 59, 999); // 设置为 HH:59:59.999
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在一天的开始时间（00:00:00.000）
function getStartOfNextDay(timestamp) {
    const date = new Date(timestamp*1000);
    date.setDate(date.getDate() + 1); // 调到下一天
    date.setHours(0, 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在一天的结束时间（23:59:59.999）
function getEndOfNextDay(timestamp) {
    const date = new Date(timestamp*1000);
    date.setDate(date.getDate() - 1); // 调到前一天
    date.setHours(23, 59, 59, 999);
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在周的下一周的开始时间（周一 00:00:00.000）
function getStartOfNextWeek(timestamp) {
    const date = new Date(timestamp*1000);
    const day = date.getDay(); // 获取当前是周几（0 表示周日）
    const diffToNextWeek = 7 - (day === 0 ? 7 : day); // 计算距离下一周的天数
    date.setDate(date.getDate() + diffToNextWeek + 1); // 跳到下一周的周一
    date.setHours(0, 0, 0, 0); // 设置为 00:00:00.000
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在周的上一周的结束时间（周日 23:59:59.999）
function getEndOfPreviousWeek(timestamp) {
    const date = new Date(timestamp*1000);
    const day = date.getDay(); // 获取当前是周几（0 表示周日）
    const diffToPreviousWeek = day === 0 ? 7 : day; // 计算距离上一周周日的天数
    date.setDate(date.getDate() - diffToPreviousWeek); // 跳到上一周的周日
    date.setHours(23, 59, 59, 999); // 设置为 23:59:59.999
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在月的下一月的开始时间（1号 00:00:00.000）
function getStartOfNextMonth(timestamp) {
    const date = new Date(timestamp*1000);
    date.setMonth(date.getMonth() + 1); // 跳到下一个月
    date.setDate(1); // 设置为 1 号
    date.setHours(0, 0, 0, 0); // 设置为 00:00:00.000
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在月的上一月的结束时间（最后一天 23:59:59.999）
function getEndOfPreviousMonth(timestamp) {
    const date = new Date(timestamp*1000);
    date.setDate(0); // 设置为当前月的前一天，即上一月的最后一天
    date.setHours(23, 59, 59, 999); // 设置为 23:59:59.999
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在年的下一年的开始时间（1月1日 00:00:00.000）
function getStartOfNextYear(timestamp) {
    const date = new Date(timestamp*1000);
    date.setFullYear(date.getFullYear() + 1); // 跳到下一年
    date.setMonth(0, 1); // 设置为 1 月 1 日
    date.setHours(0, 0, 0, 0); // 设置为 00:00:00.000
    return Math.floor(date.getTime() / 1000);
}

// 获取指定时间戳所在年的上一年的结束时间（12月31日 23:59:59.999）
function getEndOfPreviousYear(timestamp) {
    const date = new Date(timestamp*1000);
    date.setFullYear(date.getFullYear() - 1); // 跳到上一年
    date.setMonth(11, 31); // 设置为 12 月 31 日
    date.setHours(23, 59, 59, 999); // 设置为 23:59:59.999
    return Math.floor(date.getTime() / 1000);
}


// 获取指定时间戳所在小时的开始时间（HH:00:00）
function getStartOfCurrentHour(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    date.setMinutes(0, 0, 0); // 设置为当前小时的 00:00:00
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在小时的结束时间（HH:59:59）
function getEndOfCurrentHour(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    date.setMinutes(59, 59, 999); // 设置为当前小时的 59:59:999
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在天的开始时间（00:00:00）
function getStartOfCurrentDay(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    date.setHours(0, 0, 0, 0); // 设置为 00:00:00
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在天的结束时间（23:59:59）
function getEndOfCurrentDay(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    date.setHours(23, 59, 59, 999); // 设置为 23:59:59
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在周的开始时间（周一 00:00:00）
function getStartOfCurrentWeek(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    const day = date.getDay(); // 获取当前是周几（0 表示周日）
    const diffToMonday = (day === 0 ? -6 : 1) - day; // 距离周一的天数
    date.setDate(date.getDate() + diffToMonday); // 跳到本周周一
    date.setHours(0, 0, 0, 0); // 设置为 00:00:00
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在周的结束时间（周日 23:59:59）
function getEndOfCurrentWeek(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    const day = date.getDay(); // 获取当前是周几（0 表示周日）
    const diffToSunday = 7 - (day === 0 ? 7 : day); // 距离周日的天数
    date.setDate(date.getDate() + diffToSunday); // 跳到本周周日
    date.setHours(23, 59, 59, 999); // 设置为 23:59:59
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在月的开始时间（1号 00:00:00）
function getStartOfCurrentMonth(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    date.setDate(1); // 设置为 1 号
    date.setHours(0, 0, 0, 0); // 设置为 00:00:00
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在月的结束时间（最后一天 23:59:59）
function getEndOfCurrentMonth(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    date.setMonth(date.getMonth() + 1, 0); // 跳到下个月的第 0 天，即本月的最后一天
    date.setHours(23, 59, 59, 999); // 设置为 23:59:59
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在年的开始时间（1月1日 00:00:00）
function getStartOfCurrentYear(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    date.setMonth(0, 1); // 设置为 1 月 1 日
    date.setHours(0, 0, 0, 0); // 设置为 00:00:00
    return Math.floor(date.getTime() / 1000); // 转为秒
}

// 获取指定时间戳所在年的结束时间（12月31日 23:59:59）
function getEndOfCurrentYear(timestamp) {
    const date = new Date(timestamp * 1000); // 将秒转换为毫秒
    date.setMonth(11, 31); // 设置为 12 月 31 日
    date.setHours(23, 59, 59, 999); // 设置为 23:59:59
    return Math.floor(date.getTime() / 1000); // 转为秒
}





function initDataInfo(screen_m4){
    //数据集的整体开始时间、结束时间、间隔时间
    if(screen_m4.datasetname == 'nycdata'){
        screen_m4.dataStartTime = 1420041600
        screen_m4.dataEndTime = 1704038399
        screen_m4.dataDelta = 60

        screen_m4.dataCont = Math.floor((screen_m4.dataEndTime-screen_m4.dataStartTime)/screen_m4.dataDelta) + 1
    }

    if(screen_m4.screenEnd < 0){
        screen_m4.screenStart = 0
        screen_m4.screenEnd =screen_m4.dataCont-1
    }

    //根据数据集的上面信息，以及屏幕查询的开始、结束时间，计算落在屏幕区域内的第一个区间的开始时间、最后一个区间的结束时间。
    screen_m4.screenStartTimestamp = screen_m4.dataStartTime+(screen_m4.screenStart-0)*screen_m4.dataDelta
    screen_m4.screenEndTimestamp = screen_m4.dataStartTime+(screen_m4.screenEnd-0)*screen_m4.dataDelta

    if(screen_m4.func.params == 'hour'){
        screen_m4.globalIntervalStartTime = getStartOfCurrentHour(screen_m4.screenStartTimestamp)

        screen_m4.globalIntervalEndTime = getEndOfCurrentHour(screen_m4.screenEndTimestamp)
    }else if(screen_m4.func.params == 'day'){

        screen_m4.globalIntervalStartTime = getStartOfCurrentDay(screen_m4.screenStartTimestamp)

        screen_m4.globalIntervalEndTime = getEndOfCurrentDay(screen_m4.screenEndTimestamp)
    }else if(screen_m4.func.params == 'week'){
        
        screen_m4.globalIntervalStartTime = getStartOfCurrentWeek(screen_m4.screenStartTimestamp)

        screen_m4.globalIntervalEndTime = getEndOfCurrentWeek(screen_m4.screenEndTimestamp)
    }else if(screen_m4.func.params == 'month'){
        
        screen_m4.globalIntervalStartTime = getStartOfCurrentMonth(screen_m4.screenStartTimestamp)

        screen_m4.globalIntervalEndTime = getEndOfCurrentMonth(screen_m4.screenEndTimestamp)
    }else if(screen_m4.func.params == 'year'){
        
        screen_m4.globalIntervalStartTime = getStartOfCurrentYear(screen_m4.screenStartTimestamp)

        screen_m4.globalIntervalEndTime = getEndOfCurrentYear(screen_m4.screenEndTimestamp)
    }

    screen_m4.globalIntervalStart = screen_m4.screenStart + 
    Math.floor(
        (screen_m4.globalIntervalStartTime - screen_m4.screenStartTimestamp)/screen_m4.dataDelta
    )
    screen_m4.globalIntervalEnd =  screen_m4.screenEnd + 
    Math.floor(
        (screen_m4.globalIntervalEndTime - screen_m4.screenEndTimestamp)/screen_m4.dataDelta
    )
}

function buildM4_SE_Interval(screen_m4){
    let M4_array = screen_m4.M4_array


    //step 1 计算每个M4的start、end，属于哪一段interval
    for (let i = 0; i < M4_array.length; i++) {
        M4_array[i].stInterval = getInterval(screen_m4.globalIntervalStart, screen_m4.globalIntervalEnd, M4_array[i].start_time, screen_m4.intervalLength, 0, screen_m4.dataCont-1);
        M4_array[i].etInterval = getInterval(screen_m4.globalIntervalStart, screen_m4.globalIntervalEnd, M4_array[i].end_time, screen_m4.intervalLength, 0, screen_m4.dataCont-1);

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

function isContainForAggregate(node, m4){
    switch(true){
        //Node完全在M4的stInterval的左边；
        case node.eTime < m4.stInterval.start_time:
            return 1;

        //Node一部分在m4.stInterval里，一部分在左边
        case node.sTime < m4.stInterval.start_time 
            && node.eTime >= m4.stInterval.start_time:
            return 2;

        //Node完全在m4.stInterval里
        case node.sTime >= m4.stInterval.start_time 
            && node.eTime <= m4.stInterval.end_time:
            return 3;
        
        //Node一部分在m4.stInterval里，一部分在右边
        case node.sTime >= m4.stInterval.start_time 
            && node.sTime <= m4.stInterval.end_time 
            && node.eTime > m4.stInterval.end_time:
            return 4;

        //Node完全在m4.stInterval右边，且完全在m4.etInterval的左边，即node完全在m4的内部
        case node.sTime > m4.stInterval.end_time 
            && node.eTime < m4.etInterval.start_time:
            return 5;

        //Node完全在m4.stInterval右边，且一部分在m4.etInterval的左边，一部分在m4.etInterval内
        case node.sTime > m4.stInterval.end_time 
            && node.sTime <m4.etInterval.start_time
            && node.eTime >= m4.etInterval.start_time:
            return 6;

        //Node完全在m4.etInterval
        case node.sTime >= m4.etInterval.start_time
            && node.eTime <= m4.etInterval.end_time:
            return 7;
        
        //Node一部分在m4.etInterval内，一部分在m4.etInterval右
        case node.sTime >= m4.etInterval.start_time
            && node.sTime <= m4.etInterval.end_time 
            && node.eTime > m4.etInterval.end_time:
            return 8;    

        //Node完全在m4.etInterval右
        case node.sTime > m4.etInterval.end_time:
            return 9;   
    }
}


async function fenlieForAggregate(segmentTrees, width, M4_array){
    let currentNodes = []
    for(let i=0;i<segmentTrees.length;i++){
        currentNodes.push(segmentTrees[i].head)
    }

    if(currentNodes.length == 0){
        //error
        return
    }

    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }

    let i = 0;
    while(i < M4_array.length && currentNodes[0]!=null){

        let m4 = M4_array[i]
        let type = isContainForAggregate(currentNodes[0], m4);

        if(type == 1){
            //cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            for(let i=0;i<segmentTrees.length;i++){
                currentNodes[i] = currentNodes[i].nextNode
            }
            continue;
        }

        //要进行分裂
        if (type == 2 || type == 4 || type == 6 || type == 8) {
            // 对非叶子节点，分裂其左右孩子
            fenlieChildrens(segmentTrees, currentNodes, needQueryNodesTrees, null)
            for (let i = 0; i < segmentTrees.length; i++) {
                currentNodes[i] = currentNodes[i].leftChild
            }
            continue;
        }

        //进 m4.stInterval
        if (type == 3) {

            let nodePairs = []
            for (let i = 0; i < segmentTrees.length; i++) {
                nodePairs.push(currentNodes[i])
                currentNodes[i] = currentNodes[i].nextNode
            }
            m4.stInterval.nodes.push(nodePairs)
            continue;
        }

        //进 m4.innerNodes
        if (type == 5) {

            let nodePairs = []
            for (let i = 0; i < segmentTrees.length; i++) {
                nodePairs.push(currentNodes[i])
                currentNodes[i] = currentNodes[i].nextNode
            }
            m4.innerNodes.push(nodePairs)
            continue;
        }


        //进 m4.etInterval
        if (type == 7) {

            let nodePairs = []
            for (let i = 0; i < segmentTrees.length; i++) {
                nodePairs.push(currentNodes[i])
                currentNodes[i] = currentNodes[i].nextNode
            }
            m4.etInterval.nodes.push(nodePairs)
            continue;
        }

        //
        if (type == 9) {
            i++
            continue;
        }
    }

    //对computeArrayUnqueryIndex进行查询，并加到computeArray中。
    let tempArrayIndex = await Multi_Query(needQueryNodesTrees, [], segmentTrees);
}

function computeM4ValueSE_Aggregate(m4, segmentTrees,func, mode){

    m4.st_v = intervalCalculation(m4.stInterval,func)

    m4.et_v = intervalCalculation(m4.etInterval,func)

}

//准确率通过这个来调整，对天均值，区间数为3千多，算一下node数量，调整到差不多跟天均值差不多的情况。
function intervalEstimate(segmentTrees, nodePairs, func, mode, isEstimate){

    if(func.funName == 'sum'){
        return {
            tmpmin: nodePairs[0].sum,
            tmpmax: nodePairs[0].sum
        }

    }else if(func.funName == 'ave'){
        return {
            tmpmin: (nodePairs[0].min + nodePairs[0].ave)/2.0,
            tmpmax: (nodePairs[0].max+ nodePairs[0].ave)/2.0
        }
    }

}

async function initM4ForAggregate(screen_m4, segmentTrees,func, parallel, mode){

    let M4_array = screen_m4.M4_array

    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }

    for(let i=0;i<M4_array.length;i++){
        

        //init m4
        M4_array[i].alternativeNodesMax=new MaxHeap()
        M4_array[i].alternativeNodesMin=new MinHeap()
        M4_array[i].isCompletedMax=false
        M4_array[i].isCompletedMin=false
        M4_array[i].currentComputingNodeMax = []
        M4_array[i].currentComputingNodeMin = []

        // M4_array[i].currentComputingIntervalMax = []
        // M4_array[i].currentComputingIntervalMin = []


        //计算边界node
        computeM4ValueSE_Aggregate(M4_array[i], segmentTrees,func, mode)



 


        if (M4_array[i].st_v < M4_array[i].et_v) {
            M4_array[i].min = M4_array[i].st_v
            M4_array[i].max = M4_array[i].et_v

        } else {
            M4_array[i].min = M4_array[i].et_v
            M4_array[i].max = M4_array[i].st_v
        }

        if(M4_array[i].min < screen_m4.exactMin){
            screen_m4.exactMin = M4_array[i].min
        }
        if(M4_array[i].max > screen_m4.exactMax){
            screen_m4.exactMax = M4_array[i].max
        }

        if (M4_array[i].innerNodes.length == 0) {
            M4_array[i].isCompletedMax = true
            M4_array[i].isCompletedMin = true

            continue

        }





        //计算inner node
        //将m4.innerNodes全部放入候选队列
        for(let j=0;j<M4_array[i].innerNodes.length;j++){
            let nodePairs = M4_array[i].innerNodes[j]

            let {tmpmin,tmpmax}=intervalEstimate(segmentTrees, nodePairs, func, mode, false)

            if(tmpmax > M4_array[i].max)
            {
                let max_e = Object.create(element)
                max_e.value=tmpmax
                max_e.nodePairs=nodePairs
                M4_array[i].alternativeNodesMax.add(max_e)
            }

            if(tmpmin < M4_array[i].min)
            {
                let min_e = Object.create(element)
                min_e.value=tmpmin
                min_e.nodePairs=nodePairs
                M4_array[i].alternativeNodesMin.add(min_e)
            }
 
        }

        //continue
        //getCandidateMinMax(i,screen_m4)

        //计算的4步：从候选结点取，与m4.max和m4.min比较，赋给Current，获取、查询Current孩子
        let tt = huisuComputeForAggregate(M4_array[i], segmentTrees, parallel, screen_m4);

        for (let j = 0; j < segmentTrees.length; j++){
            needQueryNodesTrees[j].push(...tt[j])
        }
    }


    await  Multi_Query(needQueryNodesTrees,[], segmentTrees)
}

function getFromtNode(interval, node){

    let pre = node
    while(pre != null){
        let type = isContain(pre, interval)
        if(type == -2 || type == 2 || type == 3 || type == 4){
            return pre
        }else{
            pre = pre.preNode
        }
    }

    return null
}

function genNodesOfInterval(interval, node, segmentTrees,needQueryNodesTrees){

    let firstNode = getFromtNode(interval, node)
    while(firstNode!=null){
        let type = isContainForInterval(firstNode, interval)

        if(type == -1 || type == 1){
            firstNode=firstNode.nextNode
        }else if(type==-3 || type==5){
            interval.nodes.push([firstNode])
            firstNode.isHuisu = true

            firstNode=firstNode.nextNode
        }else if(type==3 || type==7){
            fenlieChildrens(segmentTrees, [firstNode], needQueryNodesTrees, interval)
            firstNode.isHuisu = true
            // firstNode.leftChild.isHuisu = true
            // firstNode.rightChild.isHuisu = true

            firstNode = firstNode.leftChild
        }else if(type==-5 || type==9){
            break
        }
    }

}

//getIntervalFromNode
function getContainedInterval(node, segmentTrees,needQueryNodesTrees, screen_m4){

    // 计算 sTime 和 eTime 所在的区间
    let stInterval = getInterval(screen_m4.globalIntervalStart, screen_m4.globalIntervalEnd, node.sTime, screen_m4.intervalLength, 0, screen_m4.dataCont-1);
    let etInterval = getInterval(screen_m4.globalIntervalStart, screen_m4.globalIntervalEnd, node.eTime, screen_m4.intervalLength, 0, screen_m4.dataCont-1);

    if(!isSameInterval(stInterval, etInterval)){
        return null
    }else{
        genNodesOfInterval(stInterval, node, segmentTrees,needQueryNodesTrees)
    }

    return stInterval

}


function CurrentComputeForAggregate(m4, segmentTrees,func, destination, mode, screen_m4, M4_i){


    // for min=========================================
    for (let i = 0; destination == 'min' && i < m4.currentComputingNodeMin.length; i++) {
        let currentComputingNodeIndex = m4.currentComputingNodeMin[i]
        let currentComputingNodePairs = m4.currentComputingNodeMin[i]

        //表示该节点已经被删除了
        if(currentComputingNodePairs[0].isBuild == false){
            m4.currentComputingNodeMin[i] = null
            continue
        }


        if(m4.currentComputingIntervalMin != null){
            let r = intervalCalculation(m4.currentComputingIntervalMin,func)
            if (r < m4.min) {
                m4.min = r
                hasPixExact = true
            }

            m4.currentComputingNodeMin[i] = null
            m4.currentComputingIntervalMin = null
            //顺便也更新一下max
            if(r > m4.max){
                m4.max = r
                hasPixExact = true
            }
        }else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以min为例，
            // 小于m4当前的min的，小的给Current，大的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 大于当前的max的，不管了
            // 如果都大于m4当前的min，则该节点fail了，不需要往下，


            let leftNodes = [], rightNodes = []
            for(let j=0;j<segmentTrees.length;j++){
                leftNodes.push(currentComputingNodePairs[j].leftChild)
                rightNodes.push(currentComputingNodePairs[j].rightChild)

                //currentComputingNodePairs 可以删除了
                segmentTrees[j].deleteNode(currentComputingNodePairs[j])
            }


            let { tmpmin: minLeft, tmpmax: maxLeft } = intervalEstimate(segmentTrees, leftNodes, func, mode, false)
            let { tmpmin: minRight, tmpmax: maxRight } = intervalEstimate(segmentTrees, rightNodes, func, mode, false)

            let ele = Object.create(element)

            //左右孩子都小于m4当前的min的
            if (minLeft < m4.min && minRight < m4.min) {
                // 小的给Current，大的进alternative
                if (minLeft < minRight) {
                    currentComputingNodePairs = leftNodes
                    ele.nodePairs = rightNodes
                    ele.value = minRight
                } else {
                    currentComputingNodePairs = rightNodes
                    ele.nodePairs = leftNodes
                    ele.value = minLeft
                }
                m4.alternativeNodesMin.add(ele)

            }
            // 只有1边小于m4当前的min的
            else if (minLeft < m4.min || minRight < m4.min) {
                // 小的给Current，小的不管
                if (minLeft < minRight) {
                    currentComputingNodePairs = leftNodes
                } else {
                    currentComputingNodePairs = rightNodes
                }
            }
            // 如果都小于m4当前的min，则该节点fail了，不需要往下，
            else {
                currentComputingNodePairs = null
            }
            m4.currentComputingNodeMin[i] = currentComputingNodePairs


            //同时看一下max的candidate
            if(maxLeft > m4.max){
                let ele2 = Object.create(element)
                ele2.nodePairs = leftNodes
                ele2.value = maxLeft
                m4.alternativeNodesMax.add(ele2)
            }
            if(maxRight > m4.max){
                let ele2 = Object.create(element)
                ele2.nodePairs = rightNodes
                ele2.value = maxRight
                m4.alternativeNodesMax.add(ele2)
            }
        }

    }



//======先把上面的处理好，下面照抄。

    // for max=========================================
    for (let i = 0; destination == 'max' && i < m4.currentComputingNodeMax.length; i++) {
        let currentComputingNodePairs = m4.currentComputingNodeMax[i]

        //表示该节点已经被删除了
        if(currentComputingNodePairs[0].isBuild == false){
            m4.currentComputingNodeMax[i] = null
            continue
        }


        if(m4.currentComputingIntervalMax != null){
            let r = intervalCalculation(m4.currentComputingIntervalMax,func)
            if (r > m4.max) {
                m4.max = r
                hasPixExact = true
            }

            m4.currentComputingNodeMax[i] = null
            m4.currentComputingIntervalMax = null
            //顺便也更新一下min
            if(r < m4.min){
                m4.min = r
                hasPixExact = true
            }
        }else {
            // 对非叶子节点：
            //1、计算左孩子，计算右孩子  
            //2、比较，以min为例，
            // 小于m4当前的min的，小的给Current，大的进alternative，对给Current的，需要query其孩子，进alternative的不需要，因为alternative里说不定有更好的
            // 大于当前的max的，不管了
            // 如果都大于m4当前的min，则该节点fail了，不需要往下，


            let leftNodes = [], rightNodes = []
            for(let j=0;j<segmentTrees.length;j++){
                leftNodes.push(currentComputingNodePairs[j].leftChild)
                rightNodes.push(currentComputingNodePairs[j].rightChild)

                //currentComputingNodePairs 可以删除了
                segmentTrees[j].deleteNode(currentComputingNodePairs[j])
            }


            let { tmpmin: minLeft, tmpmax: maxLeft } = intervalEstimate(segmentTrees, leftNodes, func, mode, false)
            let { tmpmin: minRight, tmpmax: maxRight } = intervalEstimate(segmentTrees, rightNodes, func, mode, false)

            let ele = Object.create(element)

            //左右孩子都小于m4当前的min的
            if (maxLeft > m4.max && maxRight > m4.max) {
                // 小的给Current，大的进alternative
                if (maxLeft > maxRight) {
                    currentComputingNodePairs = leftNodes
                    ele.nodePairs = rightNodes
                    ele.value = maxRight
                } else {
                    currentComputingNodePairs = rightNodes
                    ele.nodePairs = leftNodes
                    ele.value = maxLeft
                }
                m4.alternativeNodesMax.add(ele)

            }
            // 只有1边小于m4当前的min的
            else if (maxLeft > m4.max || maxRight > m4.max) {
                // 小的给Current，小的不管
                if (maxLeft > maxRight) {
                    currentComputingNodePairs = leftNodes
                } else {
                    currentComputingNodePairs = rightNodes
                }
            }
            // 如果都小于m4当前的min，则该节点fail了，不需要往下，
            else {
                currentComputingNodePairs = null
            }
            m4.currentComputingNodeMax[i] = currentComputingNodePairs


            //同时看一下max的candidate
            if(minLeft < m4.min){
                let ele2 = Object.create(element)
                ele2.nodePairs = leftNodes
                ele2.value = minLeft
                m4.alternativeNodesMin.add(ele2)
            }
            if(minRight < m4.min){
                let ele2 = Object.create(element)
                ele2.nodePairs = rightNodes
                ele2.value = minRight
                m4.alternativeNodesMin.add(ele2)
            }
        }

    }

    //删除null
    
    if (destination == 'min') {
        m4.currentComputingNodeMin = m4.currentComputingNodeMin.filter(item => item != null && item[0].isBuild != false);
    } else {
        m4.currentComputingNodeMax = m4.currentComputingNodeMax.filter(item => item != null && item[0].isBuild != false);
    }
}



//总结：计算的4步：step1:从候选结点取，step2:与m4.max和m4.min比较，step3:赋给Current，step4:取Current孩子
function huisuComputeForAggregate(m4, segmentTrees, parallel, screen_m4)  {
    let needQueryIndex = []
    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }

    //max 回溯，interval里的node，暂时处于 isBuild=false阶段，因此min回溯会绕过这些node，导致不会重复计算；
    //在回溯的结尾，对node统一查询，isBuild=true，保证Current可以计算。
    //current计算完后，再将node置为false，保证下一轮Current以及huisu不会处理。

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
                    if(MaxEle.nodePairs[0].isBuild == false || MaxEle.nodePairs[0].isHuisu == true){
                        //表示该节点已经被删除了, 或已经被回溯过了。
                        continue
                    }
                    
                    //step3 !!!!!todo,可以把整个ele放进去，这个CurrentCompute就有了candidate值。
                    m4.currentComputingNodeMax.push(MaxEle.nodePairs);
                    MaxEle.nodePairs[0].isHuisu = true
                }else{
                    // 堆顶不如当前m4，那么alternativeNodesMax里其他的都fail了，把alternative 清空
                    m4.alternativeNodesMax = new MaxHeap()  //后续改为清空函数
                    break
                }
            }

            if(m4.currentComputingNodeMax.length == 0){
                m4.isCompletedMax = true
            }

            
        }
    }

//todo 改为：
// 1）如果节点被区间包含，则不分裂，进行计算； 
// 2）如果节点不被区间包含，则分裂；
// 分裂的时候，还有把该区间以某种形式保留下来，并且把区间内的node带出来，给到Current计算。
// 比较好的方式，增加一个currentComputingIntervalMax，与currentComputingNodeMax对应。
    if (!m4.isCompletedMax && m4.currentComputingNodeMax.length != 0) {

        for(let i = 0;i<m4.currentComputingNodeMax.length;i++){

            let nodePairs = m4.currentComputingNodeMax[i]
            // //对叶子结点，不需要取其孩子。
            // if (isSingleLeaf(nodePairs[0])) {
            //     continue
            // }
            let node = nodePairs[0]
            let interval = getContainedInterval(node, segmentTrees,needQueryNodesTrees, screen_m4)
            m4.currentComputingIntervalMax = interval
            if(interval == null){
                //表示节点不被区间包含，则分裂；
                fenlieChildrens(segmentTrees, nodePairs, needQueryNodesTrees, m4)
                m4.currentComputingIntervalMax = null
            }

        }
    }

    
//先把上面的max处理好，min照抄。




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
                    if(MinEle.nodePairs[0].isBuild == false  || MinEle.nodePairs[0].isHuisu == true){
                        //表示该节点已经被删除了
                        continue
                    }
                    //step3
                    m4.currentComputingNodeMin.push(MinEle.nodePairs);
                    MinEle.nodePairs[0].isHuisu = true
                }else{
                    // 堆顶不如当前m4，那么alternativeNodesMin里其他的都fail了，把alternative 清空
                    m4.alternativeNodesMin = new MinHeap()  //后续改为清空函数
                    break
                }
            }

            if(m4.currentComputingNodeMin.length == 0){
                m4.isCompletedMin = true
            }

            
        }
    }

    if (!m4.isCompletedMin && m4.currentComputingNodeMin.length != 0) {

        for(let i = 0;i<m4.currentComputingNodeMin.length;i++){

            let nodePairs = m4.currentComputingNodeMin[i]
            // //对叶子结点，不需要取其孩子。
            // if (isSingleLeaf(nodePairs[0])) {
            //     continue
            // }
            let node = nodePairs[0]
            let interval = getContainedInterval(node, segmentTrees,needQueryNodesTrees, screen_m4)
            m4.currentComputingIntervalMin = interval
            if(interval == null){
                //表示节点不被区间包含，则分裂；
                fenlieChildrens(segmentTrees, nodePairs, needQueryNodesTrees, m4)
                m4.currentComputingIntervalMin = null
            }

        }

        
    }


    return needQueryNodesTrees



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

async function Start_Aggregate_Compute(segmentTrees,screen_m4,func, mode, parallel, width,height,errorBound){


    let M4_array = screen_m4.M4_array

    await initM4ForAggregate(screen_m4, segmentTrees,func, parallel, mode) 

    let needQueryIndex = []

    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }

    //经过上面的处理，以及Multi_Query后，每个像素列m4里，当前要计算的节点currentComputingNodeMax，及其孩子已经查询计算得到。
    //下面开始根据currentComputingNodeMax对左右孩子进行计算
    let computedMinCount = 0
    let computedMaxCount = 0
    let computedCount = 0
    while(computedCount < M4_array.length*2 ){

        //console.log(computedCount)
        computedCount = 0
        // screen_m4.exactMax=-Infinity
        // screen_m4.exactMin=Infinity
        // screen_m4.candidateMax=-Infinity
        // screen_m4.candidateMin=Infinity
        


        for(let i=0;i<M4_array.length;i++){

            if(i == 0){
                debug = true
            }

            //先计算min
            if(M4_array[i].isCompletedMin){
                // to repair,bug
                computedCount++
                //console.log(computedCount)
            }
            else{
                //对M4_array[i]的Current进行计算
                CurrentComputeForAggregate(M4_array[i], segmentTrees,func, 'min', mode, screen_m4, i)
            }
            
            //计算max
            if(M4_array[i].isCompletedMax){
                computedCount++
                //console.log(computedCount)
            }else{
                //对M4_array[i]的Current进行计算
                CurrentComputeForAggregate(M4_array[i], segmentTrees,func, 'max', mode, screen_m4, i)
            }

            if(M4_array[i].isCompletedMin && M4_array[i].isCompletedMax){
                M4_array[i].errorPixels = 0
            }


        }
        
        if(timelimit <10){
        //表示用了timelimit限制，就不做errorbound了
            let currentTime = performance.now()/1000.0;
            if(currentTime - procesStartTime > timelimit){
                console.log('time exist:', currentTime - procesStartTime)
                errorBoundSatisfy(screen_m4, width,height,errorBound)
                break
            }
        }else{
            timestart('errorBoundSatisfy');
            if(hasPixExact){
                hasPixExact = false
                if(errorBoundSatisfy(screen_m4, width,height,errorBound)){
                    let brk=true
                    break
                }
            }
            timeend('errorBoundSatisfy');
        }
        


 

        screen_m4.candidateMax=-Infinity
        screen_m4.candidateMin=Infinity
        for(let i=0;i<M4_array.length;i++){
            let tt = huisuComputeForAggregate(M4_array[i], segmentTrees, parallel, screen_m4);
            for (let j = 0; j < segmentTrees.length; j++){
                needQueryNodesTrees[j].push(...tt[j])
            }
        }




        //经过上面的for循环，相当于对m4像素列遍历了一遍，也就是对每个m4的 当前计算节点进行了计算，并把其左右孩子放入候选堆，
        //然后通过huisu，取出候选堆中的最优节点，并找到其孩子的index放入needQuery中
        await Multi_Query(needQueryNodesTrees,[], segmentTrees)
        for (let j = 0; j < segmentTrees.length; j++){
            needQueryNodesTrees[j] = []
        }
        //needQueryIndex = []       



    }


}

let intervalCache = {}

function setIntervalArraysFromCache(screen_m4, intervalArray, i){
    let key = `${screen_m4.datasetname}_${screen_m4.columns[i]}_${screen_m4.func.funName}#${screen_m4.func.params}`
    let ic = intervalCache[key]
    if(ic == null){
        let ic = new IntervalCache(screen_m4.datasetname,screen_m4.columns[i],screen_m4.globalIntervalStart,screen_m4.globalIntervalEnd, intervalArray)
        intervalCache[key] = ic
    }else if(screen_m4.globalIntervalStart <=ic.globalStart  && screen_m4.globalIntervalEnd >= ic.globalEnd){

        ic.globalStart = screen_m4.globalIntervalStart
        ic.globalEnd = screen_m4.globalIntervalEnd
        ic.intervals = intervalArray
    }
}

function calculate(a,b,symbol){
    if(symbol == '+'){
        return a+b
    }else if(symbol == '-'){
        return a-b
    }if(symbol == '*'){
        return a*b
    }if(symbol == '/'){
        return b==0 ? 0:a/b
    }
}

function calBetweenIntervals(interval1, interval2, func){

    let res = []
    let i1 = 0,i2=0
    while(i1 <interval1.length && i2<interval2.length){
        //let type = relationship(interval1[i1], interval2[i2])

        if(interval1[i1].start_time < interval2[i2].start_time){
            i1++
        }else if(isSameInterval(interval1[i1],interval2[i2])){

            let interval = new Interval(interval1[i1].start_time, interval1[i1].end_time,)
            interval.ave = calculate(interval1[i1].ave, interval2[i2].ave, func.funName)
            interval.sum = calculate(interval1[i1].sum, interval2[i2].sum, func.funName)
            i1++
            i2++

            res.push(interval)

        }else if(interval1[i1].start_time > interval2[i2].start_time){
            i2++
        }
    }

    return res
}

function getIntervalArraysFromCache(screen_m4){
    let intervalArrays = []
    for(let i=0;i<screen_m4.segmentTrees.length;i++){
        let key = `${screen_m4.datasetname}_${screen_m4.columns[i]}_${screen_m4.func.funName}#${screen_m4.func.params}`
        let ic = intervalCache[key]
        if(ic == null){
            return null
        }

        //判断缓存的区间，是否完全包含的当前需要的计算区间
        if(ic.globalStart <= screen_m4.globalIntervalStart && ic.globalEnd >= screen_m4.globalIntervalEnd){
            console.log(`interval: ${key} exists!`)
            intervalArrays.push(ic.intervals)
        }else{
            return null
        }
    }

    return intervalArrays


}

async function aggregateCalculation(screen_m4, segmentTrees, func,width,height, mode, symble, parallel,errorBound){

    let threshhold = 5000 

    let intervalnum = Math.ceil(
        (screen_m4.screenEnd-screen_m4.screenStart+1)
        /
        (screen_m4.intervalLength) )



    let segmentTree = segmentTrees[0]

    initDataInfo(screen_m4)

    console.log(intervalnum)
    if(intervalnum < threshhold){
        console.log("按区间大于node处理")
        let intervalArrays = getIntervalArraysFromCache(screen_m4)

        if(intervalArrays == null){
            intervalArrays = []
            for(let i=0;i<screen_m4.M4_arrays.length;i++){
                let intervalArray = buildIntervals(screen_m4)
                intervalArrays.push(intervalArray)
                setIntervalArraysFromCache(screen_m4, intervalArray, i)
            }
            await fenlieByInterval(intervalArrays,screen_m4.screenStart,screen_m4.screenEnd,segmentTrees)    
        }


        if(func != null && func.funName != ''){
            let intervalArray = calBetweenIntervals(intervalArrays[0], intervalArrays[1], func)
            intervalArrays = []
            //运算完后，只有一个M4
            intervalArrays.push(intervalArray)
            screen_m4.M4_array = screen_m4.M4_arrays[0]
        }


        initM4ByInterval(screen_m4, intervalArrays, func)

    }else{
        console.log("按区间小于node处理")

        buildM4_SE_Interval(screen_m4)

        console.time('fenlieForAggregate'); // 开始计时   
        //遍历像素列M4：
        await fenlieForAggregate(segmentTrees, width, M4_array);
        console.timeEnd('fenlieForAggregate'); // 结束计时并打印结果



        await Start_Aggregate_Compute(segmentTrees,screen_m4,func, mode, parallel, width,height,errorBound)
    }


    //return M4_array

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

async function computeMultyOrSingle(table,dataCount,columns, func, width,height, mode, symble, parallel, errorBound,screenStart,screenEnd,screen_m4){

   // console.log(tables, func, width,height, mode, symble, parallel, errorBound,screenStart,screenEnd)

    // if(func.mode == 'single'){
    //     columns = [columns[0]]
    // }

    //构建树
    let segmentTrees = []
    MAXNODENUM = memeryCache/64/columns.length

    for(let i=0;i<columns.length;i++){
        let treeName=`${table}_${columns}_${columns[i]}`

        if(treeName in treeCache){
            console.log(treeName,' exists.')
        }else{
            treeCache[treeName] = await buildtree(table,dataCount,columns,i, width, screenStart,screenEnd)
        }

        treeCache[treeName].nodeCountDelta = 0
        treeCache[treeName].belongsToScreen = screen_m4
        treeCache[treeName].maxNodeNum = MAXNODENUM
        treeCache[treeName].funInfo = func

        segmentTrees.push(treeCache[treeName])
    }

    let realDataRowNum = getRealDataRowNum(segmentTrees[0], segmentTrees[0])

    if(isNaN(screenStart) || screenStart < 0){
        screenStart = 0
    }
    if(isNaN(screenEnd) || screenEnd<0 || screenEnd > realDataRowNum-1){
        screenEnd = realDataRowNum-1
    }

    //console.log(screenStart, screenEnd)



    //构建M4数组，width个M4元素。
    //realDataRowNum = 63
    //to repair经测试，待修改。
    if(screen_m4.func != null && screen_m4.func.funName!=''){
        for(let i=0;i<columns.length;i++){
            let M4_array = computeM4TimeSE(width, [screenStart, screenEnd])
            screen_m4.M4_arrays.push(M4_array)
            screen_m4.M4_array = null
        }
    }else{
        let M4_array = computeM4TimeSE(width, [screenStart, screenEnd])
        screen_m4.M4_array = M4_array
        screen_m4.M4_arrays.push(M4_array)
    }

    screen_m4.segmentTrees = segmentTrees
    // screen_m4.screenStart = screenStart
    // screen_m4.screenEnd=screenEnd
    screen_m4.height=height
    screen_m4.width=width
    screen_m4.errorBound=errorBound
    screen_m4.deltaError = 0.05


    // 情况1：如果树的数据量较少或者width较大，导致树直接干到了底层，那么是不需要query了，直接进行计算。
    // if（判定条件），then compute（）// 最后考虑。



    // 情况2：没有到底层，则需要进行query和compute
    // query要直接查询到底，不断生成compute，
    // 然后对compute依次计算

    // 从SegmentTree1的最底层开始
    // 找到该层的第一个节点StartIndex和最后一个节点的EndIndex，
    // 从 SegmentTree1.nodes[StartIndex]~SegmentTree1.nodes[EndIndex]


    //找到该层的第一个节点StartIndex和最后一个节点的EndIndex，
    //let {StartIndex,EndIndex} = getTreeLastSE(segmentTrees[0],width, screenStart, screenEnd)

    if(screen_m4.func != null && screen_m4.func.funName!=''){
        return await aggregateCalculation(screen_m4,segmentTrees,func,width,height,mode,symble,parallel,errorBound)
    }




    // if(func.funName == 'avg' && func.mode == 'single'){

    //     return await computeAVG([segmentTrees[0]],M4_array,func,width,height,mode,symble,parallel,errorBound)
        
    // }else if(func.funName == 'avg_w' && func.mode == 'single'){
    //     return await computeAVG_W([segmentTrees[0]],M4_array,func,mode,symble,parallel, width,height,errorBound)
    // }

    //遍历像素列M4：
    //console.time('fenlie'); // 开始计时   

    await fenlie(screen_m4.M4_array, screenStart,screenEnd, segmentTrees, func, []);

    //traversalBottom(segmentTrees[0])
    //console.timeEnd('fenlie'); // 结束计时并打印结果
    //M4.innerNode,表示在M4像素列里的node，这些node是需要进行计算的
    //经过上面的while循环后，确定了所有需要计算的节点，保存在每个的M4.innerNode,表示在M4像素列里的node，这些node是需要进行计算的
    //按symble运算符or函数，对按照SegmentTree1,SegmentTree2树结构，对M4_array中的节点进行计算，得到。
    await Start_Multi_Compute(segmentTrees,screen_m4,func, mode, parallel, width,height,errorBound)


    screen_m4.segmentTrees = segmentTrees
    screen_m4.dataReductionRatio = 1 - segmentTrees[0].nodeCount*2 / segmentTrees[0].realDataNum



    return screen_m4
}


function getExtremeInInterval(min, max) {
    let min_pre_k = Math.ceil(min / Math.PI - 0.5);
    let max_pre_k = Math.floor(max / Math.PI - 0.5);

    let extreme = []
    for (let k = min_pre_k; k <= max_pre_k; k++) {
        extreme.push((k+0.5)*Math.PI);
    }

    return extreme;
}


class FunInfo{
    constructor(funName, extremes, params){
        this.funName = funName;
        this.params = params

        this.intervalRange = 0
        this.extremes = []
        this.mode = 'multi'
        if(extremes != null){
            this.extremes.push(...extremes)
        }


        //字典，key为函数名，如func1、func2_0；value为对应的极值点数组。对x函数，取[0],对x和y函数，分别[0]和[1]
        this.maxExtremes = {}
        this.minExtremes = {}

        this.init()
    };

    init(){

        this.maxExtremes = {}
        this.minExtremes = {}

        //初始化func1、func2_0等的极值点。
        this.maxExtremes['func1'] = []
        this.minExtremes['func1'] = []
        this.maxExtremes['func1'].push(-31.62)
        this.minExtremes['func1'].push(31.62)

        this.maxExtremes['boxcox_0'] = []
        this.minExtremes['boxcox_0'] = []

        this.maxExtremes['boxcox_1_2'] = []
        this.minExtremes['boxcox_1_2'] = []

        this.maxExtremes['boxcox_1'] = []
        this.minExtremes['boxcox_1'] = []

        this.maxExtremes['boxcox_2'] = []
        this.minExtremes['boxcox_2'] = []
        this.minExtremes['boxcox_2'].push(0)

        this.maxExtremes['func3'] = []
        this.minExtremes['func3'] = []

        this.maxExtremes['func4'] = []
        this.minExtremes['func4'] = []
        //todo  初始化其他函数的极值点。
        this.weights = weights
        
    }


    weightsum(nodes, destination, isLeaf) {
        //函数：sum(wi * xi)
        let weights = this.weights //[-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10]
        let sum = 0
        if(destination === 'min'){
            for(let i=0;i<nodes.length;i++){
                let node = nodes[i]
                let weight = weights[i]
                
                if(weight >0){
                    sum += weight*node.min
                }else{
                    sum += weight*node.max
                }
            }
        }else{
            for(let i=0;i<nodes.length;i++){
                let node = nodes[i]
                let weight = weights[i]

                if(weight <0){
                    sum += weight*node.min
                }else{
                    sum += weight*node.max
                }
            }
        }

        return sum
    }

    L2(nodes, destination, isLeaf) {
        //函数：sqrt[ sum(xi ^ 2) ]

        let sum = 0
        if(destination === 'min'){
            for(let i=0;i<nodes.length;i++){
                let node = nodes[i]
                if(node.min * node.max < 0){
                    sum += 0
                }else{
                    sum += Math.min(node.min*node.min, node.max*node.max)
                }
            }
        }else{
            for(let i=0;i<nodes.length;i++){
                let node = nodes[i]
                sum += Math.max(node.min*node.min, node.max*node.max)
            }
        }
        return Math.sqrt(sum)
    }

    getmax(nodes, destination, isLeaf) {
        let maxofmax = -Infinity
        let maxofmin = -Infinity

        for(let i=0;i<nodes.length;i++){
            let node = nodes[i]
            maxofmax = Math.max(maxofmax, node.max)
            maxofmin = Math.max(maxofmin, node.min)
        }
        if(destination === 'min'){
            return maxofmin
        }else{
            return maxofmax
        }
    }

    func4(nodes, destination, isLeaf) {
        // 函数: (1 - sin x)(ln(|y|+1))^2
    
        if(isLeaf){
            let x = nodes[0].min
            let y=nodes[1].min
            return (1 - Math.sin(x)) * (Math.log(Math.abs(y)+1)) **2
        }
    
        const xRange = nodes[0];
        const yRange = nodes[1];
        //console.log(`xRange: ${Math.sin(xRange.min)}, ${Math.sin(xRange.max)}, yRange: ${yRange.min}, ${yRange.max}`)
    
        let x_min=Infinity, x_max=-Infinity, y_min, y_max = 0;
        if (xRange.max - xRange.min >= (2 * Math.PI)) {
            x_min = -1;
            x_max = 1;
        } else {
    
            let extreme = getExtremeInInterval(xRange.min, xRange.max);
            extreme.push(xRange.min)
            extreme.push(xRange.max)
            for (let i = 0; i < extreme.length; i++) {
                let tmp = Math.sin(extreme[i]);
            
                if(x_min>tmp){
                    x_min=tmp
                }
                if(x_max<tmp){
                    x_max=tmp
                }
            }
    
        }
    
    
        y_max = Math.max(Math.abs(yRange.min), Math.abs(yRange.max));
        if (yRange.min * yRange.max < 0) {
            y_min = 0;
        } else {
            y_min = Math.min(Math.abs(yRange.min), Math.abs(yRange.max));
        }
       //console.log(`x_min = ${x_min}\nx_max = ${x_max}\ny_min = ${y_min}\ny_max = ${y_max}\n`)
    
        if (destination === 'min') {
            return (1 - x_max) * (Math.log(y_min + 1)) ** 2;
        } else {
            return (1 - x_min) * (Math.log(y_max + 1)) ** 2;
        }
    }

    //所有的nodes全是数组，只是对x函数，取nodes[0];对x和y函数，分别nodes[0]和nodes[1]
    compute(funName, nodes, destination){
 
        if(destination == 'min'){
            let Xs = this.generateXs(nodes[0].min, this.minExtremes[funName], nodes[0].max)
            let min = Infinity

            for(let i=0;i<Xs.length;i++){
                let x = Xs[i]
                let y= this.getFunc(funName, x)

                if(min > y){
                    min = y
                }
            }

            return min
        }else{
            let Xs = this.generateXs(nodes[0].min, this.maxExtremes[funName], nodes[0].max)
            let max = -Infinity

            for(let i=0;i<Xs.length;i++){
                let x = Xs[i]
                let y= this.getFunc(funName, x)

                if(max < y){
                    max = y
                }
            }

            return max
        }
    }

    getFunc(funName, x){
        if(funName == 'func1'){
            return this.func1(x)
        }else if(funName == 'boxcox_0'){
            return this.boxcox_0(x)
        }else if(funName == 'boxcox_1_2'){
            return this.boxcox_1_2(x)
        }else if(funName == 'boxcox_1'){
            return this.boxcox_1(x)
        }else if(funName == 'boxcox_2'){
            return this.boxcox_2(x)
        }


        return this.compute_defult(x) 
    }

    func1(x){
        //0.001*x^3 - 3*x
        let y = 0.001*(x**3) - 3*x

        return y
    }

    boxcox_0(x){
        //Box-Cox,lambda = 0
        //logx
        if(x<=0){
            return 0
        }

        return Math.log(x)
    }
    
    boxcox_1_2(x){
        //Box-Cox,lambda =1/2
        //(x**(1/2) - 1)/(1/2)
        if(x<=0){
            x=0
        }

        return (x**(1/2) - 1)/(1/2)
    }
   
    boxcox_1(x){
        //Box-Cox,lambda = 1
        //x-1

        return x-1
    }
    
    boxcox_2(x){
        //Box-Cox,lambda = 2
        //(x**2 - 1)/2

        return (x**2 - 1)/2
    }

    
   


    // func1(nodes, destination){
    //     //0.001*x^3 - 3*x

    //     if(destination == 'min'){
    //         let Xs = this.generateXs(nodes[0].min, this.minExtremes['func1'], nodes[0].max)
    //         let min = Infinity

    //         for(let i=0;i<Xs.length;i++){
    //             let x = Xs[i]
    //             let y= 0.001*(x**3) - 3*x

    //             if(min > y){
    //                 min = y
    //             }
    //         }

    //         return min
    //     }else{
    //         let Xs = this.generateXs(nodes[0].min, this.maxExtremes['func1'], nodes[0].max)
    //         let max = -Infinity

    //         for(let i=0;i<Xs.length;i++){
    //             let x = Xs[i]
    //             let y= 0.001*(x**3) - 3*x

    //             if(max < y){
    //                 max = y
    //             }
    //         }

    //         return max
    //     }
    // }

    // func2_0(nodes, destination){
    //     //Box-Cox,lambda = 0
    // }

    // func2_1_2(nodes, destination){
    //     //Box-Cox,lambda =  1/2
    // }

    // func2_1(nodes, destination){
    //     //Box-Cox,lambda = 1
    // }

    // func2_2(nodes, destination){
    //     //Box-Cox,lambda = 2
    // }


    // func3(nodes, destination){
    //     //x^(1/(|y|+1))
    // }

    // func4(nodes, destination){
    //     //(1-sin x)(ln(|y|+1))^2
    // }

    func_variance(nodes, destination){
        //方差，若干个node，数量不固定，计算方差
    }



    //extremes是一个数组，返回一个数组，数组包含：min、max、以及extremes中在min和max之间的
    generateXs(min, extremes, max){

        let x = []

        if(extremes != null){
            for(let i=0;i<extremes.length;i++){
                if(extremes[i] > min && extremes[i] < max){
                    x.push(extremes[i])
                }
            }
        }

        x.push(min)
        x.push(max)

        return x
    }

    compute_defult(x){
        let y = x

        return y
    }
    //根据funName函数体，依次计算Xs的函数值，返回Ys数组
    computes_defult(Xs){

        let Ys=[]
        for(let i=0;i<Xs.length;i++)
        {
            //todo
            //Ys.push(sin()+cos()+....)
            let x=Xs[i]
            let y=this.compute_defult(x)

            Ys.push(y)
        }
        
        return Ys
    }

}



// class FunInfo{
//     constructor(funName, extremes){
//         this.funName = funName;
//         this.intervalRange = 0
//         this.extremes = []
//         this.mode = 'multi'
//         if(extremes != null){
//             this.extremes.push(...extremes)
//         }
//     };
    
//     compute(x){
//         let y = x + 1

//         return y
//     }
//     //根据funName函数体，依次计算Xs的函数值，返回Ys数组
//     computes(Xs){

//         let Ys=[]
//         for(let i=0;i<Xs.length;i++)
//         {
//             //todo
//             //Ys.push(sin()+cos()+....)
//             let x=Xs[i]
//             let y=this.compute(x)

//             Ys.push(y)
//         }
        
//         return Ys
//     }

// }


//！！！！！！！分裂，是多棵树的构造，因此，stNode、etnode、InnerNode，都要成对存放多棵树，pairs。
async function fenlie(M4_array, screenStart,screenEnd, segmentTrees, func, leaves) {
    

    let currentNodes = []
    for(let i=0;i<segmentTrees.length;i++){
        currentNodes.push(segmentTrees[i].head)
    }

    if(currentNodes.length == 0){
        //error
        return
    }

    
    let needQueryNodesTrees = new Array(segmentTrees.length)
    for (let i = 0; i < needQueryNodesTrees.length; i++) {
        needQueryNodesTrees[i] = [];
    }
 
    let i = 0;
    while(i < M4_array.length && currentNodes[0]!=null){

        let m4 = M4_array[i]
        let type = isContain(currentNodes[0], m4);


        //对叶子结点
        if(type == -1){
            for(let i=0;i<segmentTrees.length;i++){
                currentNodes[i] = currentNodes[i].nextNode
            }

            continue;
        }

        //叶子Node与M4左边界重合，该节点的值（因为是叶子节点，所以min=max）赋给该M4的左边界st_v
        if(type == -2){
            //m4.stNodeIndex=node.index   
            for(let i=0;i<segmentTrees.length;i++){
                m4.stNodes.push(currentNodes[i])
                currentNodes[i] = currentNodes[i].nextNode
            }

            continue;
        }

        //叶子Node在M4内部，放到该M4的inner中
        if (type == -3) {
            //m4.innerNodes.push(node.index)
            let nodePairs = []
            for(let i=0;i<segmentTrees.length;i++){
                nodePairs.push(currentNodes[i])
                currentNodes[i] = currentNodes[i].nextNode
            }
            m4.innerNodes.push(nodePairs)
            continue;
        }

        //叶子Node与M4右边界重合，该节点的值（因为是叶子节点，所以min=max）赋给该M4的右边界et_v
        if (type == -4) {
            //m4.etNodeIndex = node.index
            for(let i=0;i<segmentTrees.length;i++){
                m4.etNodes.push(currentNodes[i])
                currentNodes[i] = currentNodes[i].nextNode
            }
            continue;
        }
        if(type == -5){
            i++
            continue;
        }

        if(type == 1){
            //cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)
            for(let i=0;i<segmentTrees.length;i++){
                currentNodes[i] = currentNodes[i].nextNode
            }
            continue;
        }

        //要进行分裂
        if(type == 2 || type == 3 || type == 4 || type == 6 || type == 7 || type == 8){


             // 对非叶子节点，分裂其左右孩子
             for(let i=0;i<segmentTrees.length;i++){
                let{leftChild, rightChild} = getChildren(segmentTrees[i],currentNodes[i])

                needQueryNodesTrees[i].push(leftChild)
                needQueryNodesTrees[i].push(rightChild)

                currentNodes[i].leftChild = leftChild
                currentNodes[i].rightChild = rightChild
                leftChild.parent = currentNodes[i]
                rightChild.parent = currentNodes[i]

                //更新双向链表
                leftChild.preNode = currentNodes[i].preNode
                leftChild.nextNode = rightChild
                rightChild.preNode = leftChild
                rightChild.nextNode = currentNodes[i].nextNode

                if(leftChild.preNode != null){
                    leftChild.preNode.nextNode = leftChild
                }
                if(rightChild.nextNode != null){
                    rightChild.nextNode.preNode = rightChild
                }

                if(segmentTrees[i].head.index == currentNodes[i].index){
                    segmentTrees[i].head = leftChild
                }

                currentNodes[i] = leftChild
            }
            
            //!!!!!!!todo
            if(func.funName == 'avg_w'){
                // segmentTrees[0].minDLL.parentToChildren(node.index,leftIndex, rightIndex)
                // segmentTrees[0].maxDLL.parentToChildren(node.index,leftIndex, rightIndex)
            }

            continue;
        }




        // 对非叶子节点，如果该node完全包含在M4内部，则不需要分裂，而是仅仅将该node加入到M4的innerNodes中即可。
        if(type == 5){
            //注意一下，对这种innerNodes的处理，在division外部已经处理了，看一下是否会处理重复。
            // m4.innerNodes.push(node.index)
            // cuttentNode = segmentTrees[0].bottonLevelDLL.getNext(cuttentNode.ownIndex)

            let nodePairs = []
            for(let i=0;i<segmentTrees.length;i++){
                nodePairs.push(currentNodes[i])
                currentNodes[i] = currentNodes[i].nextNode
            }
            m4.innerNodes.push(nodePairs)
            continue;
        }

        if (type === 9) {
            i++;
            continue;
        }

    }

    //对computeArrayUnqueryIndex进行查询，并加到computeArray中。
    let tempArrayIndex = await Multi_Query(needQueryNodesTrees, leaves, segmentTrees);
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


let ablationStudyDict = {}

function outputM4(screen_m4){
    let M4_array=screen_m4.M4_array  

    for(let key in stats.callCounts){
        timetotal(key)
    }

    let SQLtime = getTotalTime('SQL.query.time')
    let totalTime = getTotalTime('totaltime')

    if(isNaN(SQLtime)){
        SQLtime = 0
    }

    console.log('experiment:',screen_m4.experiment
            ,'; table:',screen_m4.datasetname
            ,'; interacttype:',screen_m4.interact_type
            ,'; columns:',`${screen_m4.columns}`
            ,'; memLimit:',screen_m4.memLimit
            // ,', maxNodeNum:',screen_m4.segmentTrees[0].maxNodeNum
            // ,', nodeCount:',screen_m4.segmentTrees[0].nodeCount
            ,'; errorBound:',screen_m4.errorBound
            ,'; symbolName:',`${screen_m4.symbolName}`
            ,'; width:',screen_m4.width
            ,'; startTime:',screen_m4.screenStart
            ,'; endTime:',screen_m4.screenEnd
            ,'; totaltime:', totalTime.toFixed(3)+''
            ,'; sqltime:', SQLtime.toFixed(3)+'')
    //console.log(screen_m4.M4_arrays)
    if(screen_m4.M4_array != null){
        let writestr = `m4 info; globalMin: ${screen_m4.min_values} ;globalMax: ${screen_m4.max_values} ; experiment: ${screen_m4.experiment} ;interacttype: ${screen_m4.interact_type} ;table: ${screen_m4.datasetname} ;columns: ${screen_m4.columns} ;symbol: ${screen_m4.symbolName} ;width: ${screen_m4.width} ;height: ${screen_m4.height} ;startTime: ${screen_m4.screenStart} ; endTime: ${screen_m4.screenEnd} ;errorBound: ${screen_m4.errorBound} ; error: ${screen_m4.preError.toFixed(4)} ; memLimit: ${screen_m4.memLimit}`

        for(let i=0;i<M4_array.length;i++){
            let m4 = M4_array[i]
            let m4str=`m4: ${i} sT: ${m4.start_time} ,eT: ${m4.end_time} ,sV: ${m4.st_v.toFixed(3)} ,eV: ${m4.et_v.toFixed(3)} ,min: ${m4.min.toFixed(3)} ,max: ${m4.max.toFixed(3)}`
    
            writestr = `${writestr}\n${m4str}`
    
        }
    
        //console.log(writestr)
        //${e}_${w}_${eb}_${str}_${ss}.m4
        fs.writeFileSync(`../m4_result/${screen_m4.experiment}_${screen_m4.interact_type}_${screen_m4.columns}_${screen_m4.width}_${screen_m4.memLimit}_${screen_m4.datasetname}_${screen_m4.screenStart}_${screen_m4.screenEnd}_${screen_m4.errorBound}_${screen_m4.symbolName}.m4`, writestr);
    }else{
        for(let m=0 ; m<screen_m4.M4_arrays.length;m++){
            M4_array = screen_m4.M4_arrays[m]

            let writestr = `m4 info; globalMin: ${screen_m4.min_values} ;globalMax: ${screen_m4.max_values} ; experiment: ${screen_m4.experiment} ,interacttype: ${screen_m4.interact_type} ,table: ${screen_m4.datasetname} ;columns: ${screen_m4.columns[m]} ;symbol: ${screen_m4.symbolName}#${screen_m4.func.params} ;width: ${screen_m4.width} ;height: ${screen_m4.height} ;startTime: ${screen_m4.screenStart} ; endTime: ${screen_m4.screenEnd} ;errorBound: ${screen_m4.errorBound} ; error: ${screen_m4.preError.toFixed(4)} ; memLimit: ${screen_m4.memLimit}`
    
            for(let i=0;i<M4_array.length;i++){
                let m4 = M4_array[i]
                let m4str=`m4: ${i} sT: ${m4.start_time} ,eT: ${m4.end_time} ,sV: ${m4.st_v.toFixed(3)} ,eV: ${m4.et_v.toFixed(3)} ,min: ${m4.min.toFixed(3)} ,max: ${m4.max.toFixed(3)}`
    
                writestr = `${writestr}\n${m4str}`
    
            }
    
            //console.log(writestr)
            //${e}_${w}_${eb}_${str}_${ss}.m4
            fs.writeFileSync(`../m4_result/${screen_m4.experiment}_${screen_m4.interact_type}_${screen_m4.columns[m]}_${screen_m4.width}_${screen_m4.memLimit}_${screen_m4.datasetname}_${screen_m4.screenStart}_${screen_m4.screenEnd}_${screen_m4.errorBound}_${screen_m4.symbolName}#${screen_m4.func.params}.m4`, writestr);
        }
    }

    


    // if(screen_m4.sx in ablationStudyDict){
    //     //console.log(ablationStudyDict)
    //     ablationStudyDict[screen_m4.sx]["buildNodeNum"] += segmentTrees[0].nodeCountDelta
    //     ablationStudyDict[screen_m4.sx]["totaltime"] += totalTime
    //     ablationStudyDict[screen_m4.sx]["sqltime"] += SQLtime
    // }else{
    //     ablationStudyDict[screen_m4.sx] = {}
    //     ablationStudyDict[screen_m4.sx]["buildNodeNum"] = segmentTrees[0].nodeCountDelta
    //     ablationStudyDict[screen_m4.sx]["totaltime"] = totalTime
    //     ablationStudyDict[screen_m4.sx]["sqltime"] = SQLtime
    // }

    // let ablationStudyResult = `ablationStudyResult: type:${screen_m4.sx}, buildNodeNum: ${segmentTrees[0].nodeCountDelta}, totaltime: ${totalTime.toFixed(3)} ,sqltime: ${SQLtime.toFixed(3)}, dataset:${screen_m4.datasetname}, function: ${screen_m4.symbolName}`
    // console.log(ablationStudyResult)


}

function gettable(table_name, tableType){
    if(tableType == 'om3'){
 
        if(!table_name.endsWith('_om3')){
            table_name =  table_name + '_om3';
        }

    }else if(tableType == 'tv'){
        if(table_name.endsWith('_om3')){
            table_name = removeEndChar(table_name, '_om3');
        }
    }

    return table_name
}

function getcolumn(columns,funInfo, tableType){
    let f = 'v'

    let order = []
    order.push(`${f}${columns[0]}`)
    for (let i = 1; i < columns.length; i++) {
        if (columns[i] == '' || columns[i] == null) {
            continue
        }

        if (funInfo.funName == 'func1' || funInfo.funName == 'boxcox_0'
            || funInfo.funName == 'boxcox_1_2' || funInfo.funName == 'boxcox_1' || funInfo.funName == 'boxcox_2') {
            //一元计算，table_name_others不取
            if (order.length > 0) {
                //二元计算，table_name_others只取1个
                break
            }

        } else if (funInfo.funName == '+' || funInfo.funName == '-' || funInfo.funName == '*' || funInfo.funName == '/'
            || funInfo.funName == 'func3' || funInfo.funName == 'func4') {
            if (order.length > 1) {
                //二元计算，table_name_others只取1个
                break
            }
        }

        order.push(`${f}${columns[i]}`)
    }
    // if(table_name_others.length > 0){
    //     tables.push(...table_name_others)
    // }



    //columns.splice(0, columns.length, ...order);

    if (tableType == 'om3') {

        for (let i = 0; i < columns.length; i++) {
            order[i] = parseInt(order[i].replace('v', '')) - 1;
        }
    }


    return order
}

let columnsNum = 2
function mergeTables(table_name, columns, funInfo, tableType){
    let order = []
    order.push(`v${columns[0]}`)
    for(let i=1;i<columns.length;i++){
        if(columns[i] == '' || columns[i] == null){
            continue
        }

        if(funInfo.funName == 'func1' || funInfo.funName == 'boxcox_0' 
            || funInfo.funName == 'boxcox_1_2' || funInfo.funName == 'boxcox_1' || funInfo.funName == 'boxcox_2'
        ){
             //一元计算，table_name_others不取
             if(order.length >0){
                //二元计算，table_name_others只取1个
                break
            }

        }else if(funInfo.funName == '+' || funInfo.funName == '-' || funInfo.funName == '*' || funInfo.funName == '/'
             || funInfo.funName == 'func3' || funInfo.funName == 'func4' ){
            if(order.length >1){
                //二元计算，table_name_others只取1个
                break
            }
        }

        order.push(`v${columns[i]}`)
    }
    // if(table_name_others.length > 0){
    //     tables.push(...table_name_others)
    // }


    if(tableType == 'om3'){
 
        if(!table_name.endsWith('_om3')){
            table_name =  table_name + '_om3';
        }

    }else if(tableType == 'tv'){
        if(table_name.endsWith('_om3')){
            table_name = removeEndChar(table_name, '_om3');
        }
    }

    columns.splice(0, columns.length, ...order);

    columnsNum = columns.length
    //console.log('columns.length:',columns.length)

    return table_name

}


function mergeTable_old(table_name1,table_name_others,funInfo, tableType){
    let tables = []
    tables.push(table_name1)
    for(let i=0;i<table_name_others.length;i++){
        if(table_name_others[i] == '' || table_name_others[i] == null){
            continue
        }

        if(funInfo.funName == 'func1' || funInfo.funName == 'boxcox_0' 
            || funInfo.funName == 'boxcox_1_2' || funInfo.funName == 'boxcox_1' || funInfo.funName == 'boxcox_2'){
             //一元计算，table_name_others不取
             if(tables.length >0){
                //二元计算，table_name_others只取1个
                break
            }

        }else if(funInfo.funName == '+' || funInfo.funName == '-' || funInfo.funName == '*' || funInfo.funName == '/'
             || funInfo.funName == 'func3' || funInfo.funName == 'func4' ){
            if(tables.length >1){
                //二元计算，table_name_others只取1个
                break
            }
        }

        tables.push(table_name_others[i])
    }
    // if(table_name_others.length > 0){
    //     tables.push(...table_name_others)
    // }


    if(tableType == 'om3'){
        for(let i=0;i<tables.length;i++){
            if(!tables[i].endsWith('_om3')){
                tables[i] =  tables[i] + '_om3';
            }
        }
    }else if(tableType == 'tv'){
        for(let i=0;i<tables.length;i++){
            if(tables[i].endsWith('_om3')){
                tables[i] = removeEndChar(tables[i], '_om3');
            }
         }
    }


    return tables


}


//om3(table_name1,table_name_others,symble,'',width,height,mode,parallel,errorBound,startTime,endTime, interact_type)
async function ours(table_name,dataCount,columns,symble,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4, estimateType){

    procesStartTime = performance.now()/1000.0;

    //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
    symble = symble.split(';')
    if(symble.length > 1){
        params = symble[1].split(',')
    }else{
        params = []
    }

    let funInfo = new  FunInfo(symble[0],params)
    //let funInfo = screen_m4.func

    //let funInfo = new  FunInfo(symble[0],params)
    // if(funInfo.funName == 'sin' || funInfo.funName == 'Box-Cox'){
    //     funInfo.mode = 'single'
    // } else {
    //     funInfo.mode = 'multi'
    // }
    
    // if(funInfo.funName == 'avg' && funInfo.mode == 'single'){
    //     funInfo.intervalRange = funInfo.extremes[0]
        
    // }else if(funInfo.funName == 'avg_w' && funInfo.mode == 'single'){
    //     funInfo.intervalRange = funInfo.extremes.length
    // }


    let table = mergeTables(table_name,columns,funInfo,'om3')

    //console.log(columns)
    //screen_m4.columns = columns
    //let currentPool = pool

    // let M4_array = multi_compute(table1, table2, symbol, width)


    
    await computeMultyOrSingle(table,dataCount,columns, funInfo, width,height, mode, symble, parallel, errorBound,startTime,endTime,screen_m4)
    //let M4_array = await computeMultyOrSingle([table1], funInfo, width, 'single', symbol, parallel)


    

    //向客户端发送M4_array结果
    //send(M4_array)

    
 

    let M4_arrays = [];
    let min_values = [];
    let max_values = [];

    if(screen_m4.estimateType == 'a'){
        screen_m4.min_values.push(screen_m4.exactMin)
        screen_m4.max_values.push(screen_m4.exactMax)

    }else if(screen_m4.estimateType == 'b'){
        screen_m4.min_values.push(screen_m4.exactMin)
        screen_m4.max_values.push(screen_m4.exactMax)

    }else if(screen_m4.estimateType == 'c'){
        screen_m4.min_values.push(screen_m4.candidateMin)
        screen_m4.max_values.push(screen_m4.candidateMax)

    }else if(screen_m4.estimateType == 'd'){
        finalCompute(screen_m4, funInfo)
        screen_m4.min_values.push(screen_m4.exactMin)
        screen_m4.max_values.push(screen_m4.exactMax)

    }else if(screen_m4.estimateType == 'e'){
        CandidateAsValue(screen_m4, funInfo)
        screen_m4.min_values.push(screen_m4.exactMin)
        screen_m4.max_values.push(screen_m4.exactMax)

    }else if(screen_m4.estimateType == 'f'){
        CandidateAsValue(screen_m4, funInfo)
        screen_m4.min_values.push(screen_m4.candidateMin)
        screen_m4.max_values.push(screen_m4.candidateMax)
        //console.log(screen_m4.max_values)
    }else{
        finalCompute(screen_m4, funInfo)
        screen_m4.min_values.push(screen_m4.exactMin)
        screen_m4.max_values.push(screen_m4.exactMax)
    }

    // else{

    //     finalCompute(screen_m4, funInfo)
    //     M4_arrays.push(screen_m4.M4_array);
    //     min_values.push(screen_m4.exactMin);
    //     max_values.push(screen_m4.exactMax);
    // }

    return screen_m4


 
}

async function excuteSQL(querySQL, i) {
    
    const queryData = await pool.query(querySQL);
    return queryData
}

async function profile(func, ...params) {

    let start = performance.now();

    //console.time(func.name); // 开始计时
    const result = await func(...params); // 执行函数
    //console.timeEnd(func.name); // 结束计时并打印结果

let end = performance.now();

console.log('start:', ((end - start) / 1000).toFixed(3)+'s')

    return result;
}
 





const stats = {
    functionTimes: {},
    startTimes: {},
    callCounts: {}  // 新增用于记录调用次数
};

async function Experiments(experiment, startTime, endTime, table_name,dataCount, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4) {

    //console.log('Experiments:',experiment, startTime, endTime, table_name, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4)


    let datasetname = table_name
    datasetname = datasetname.replace(/_/g, '');  // 使用正则表达式去掉所有的下划线



    let symbolName = getSymbolName(symbol);

    //screen_m4 = new SCREEN_M4(experiment, datasetname, 0, symbolName, width, height, errorBound, null)
    screen_m4.estimateType = 'estimateType'
    screen_m4.sx = 'sx'
    screen_m4.screenStart = startTime
    screen_m4.screenEnd = endTime
    screen_m4.columns = [...columns]

    //eg:  symbol = '-;ave#week'   ' ;ave#week'  '+'
    let s = symbol.split(';')
    if(s.length > 1){
        symbol = s[0];
        let ag = s[1].split('#')
        let func = new FunInfo(ag[0],null,ag[1])
        screen_m4.func = func
    }else{
        screen_m4.func = null
    }


    errorBoundSatisfyCount = 0
    if (!isTreeCache) {
        treeCache = {}
    }


    genDatainfo(screen_m4)




    timeclear()
    timestart('totaltime')

    switch (experiment) {
        case 'ours':
            await ours(table_name,dataCount, columns, symbol, '', width, height, mode, parallel, errorBound, startTime, endTime, interact_type, screen_m4);
            break;
        case 'aggregate' :
            await aggregate(table_name, columns, width, screen_m4);
            break;
        case 'case1':
            await Case1(table_name, columns, symbol, '', width, height, mode, parallel, errorBound, startTime, endTime, interact_type, screen_m4); 
            break;
        case 'PG-F':
            await Case2(table_name, columns, symbol, '', width, height, mode, parallel, errorBound, startTime, endTime, interact_type, screen_m4); 
            break;
        case 'OM3':
            await Case3(table_name,dataCount, columns, symbol, '', width, height, mode, parallel, errorBound, startTime, endTime, interact_type, screen_m4); 
            break;
        case 'PG-M4':
            await Case4(table_name, columns, symbol, '', width, height, mode, parallel, errorBound, startTime, endTime, interact_type, screen_m4); 
            break;
        case 'IFX-F':
            await Case5(table_name, columns, symbol, '', width, height, mode, parallel, errorBound, startTime, endTime, interact_type, screen_m4); 
            break;
        case 'IFX-M4':
            await Case6(table_name, columns, symbol, '', width, height, mode, parallel, errorBound, startTime, endTime, interact_type, screen_m4); 
            break;


        case 'test':
            await Case6_test(table_name, columns, symbol, '', width, height, mode, parallel, errorBound, startTime, endTime, interact_type, screen_m4);
            break;
    }
    
    timeend('totaltime');

    outputM4(screen_m4)
}


function timeclear() {
    stats.functionTimes = {}
    stats.startTimes = {}
    stats.callCounts = {}

}

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


    return timeSpent
}

function getTotalTime(functionName){
    return (stats.functionTimes[functionName]) / 1000.0
}

function getTotalCount(functionName){
    return stats.callCounts[functionName] || 0
}

function getAvgTime(functionName){
    const totalTime = stats.functionTimes[functionName];
    const count = stats.callCounts[functionName] || 0;

    if (totalTime !== undefined) {
        return totalTime/1000.0/count
    } else {
        console.log(`No timing data for ${functionName}`);
        return 0;
    }
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









 //====================以下都是实验代码================
 //
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
   
   
       return res;

}



function generateM4(result, width, startTime, endTime){

    let res = computeM4TimeSE(width, [startTime, endTime]);
    //console.log(res)
    let MIN = Infinity;
    let MAX = -Infinity;
    let difference = startTime;
    res.forEach(e =>{
        let min = Infinity;
        let max = -Infinity;
        for(let i = e.start_time; i <= e.end_time; i++){
            if(result[i - difference].v < min){
                min = result[i - difference].v
            }

            if(result[i - difference].v > max){
                max = result[i - difference].v
            }
        }
        e.min = min
        e.max = max
        e.st_v = result[e.start_time - difference].v
        e.et_v = result[e.end_time - difference].v
        // 更新MIN,MAX
        if (MIN > min) { MIN = min; }
        if (MAX < max) { MAX = max; }       
    })

    return {
        M4_array: res,
        min_value: MIN,
        max_value: MAX
    }
}



async function readDataFromDB(pool, table_name, column, startTime, endTime) {
    let sql = `select t, ${column} as v from ${table_name} `;
    // 如果 endTime < 0, 取全量数据
    if (endTime >= 0){
        sql = sql.concat(`where t between ${startTime} and ${endTime} `);
    }
    sql = sql.concat('order by t asc')
    console.log(`sql: ${sql}\n`);

    let result = await pool.query(sql);

    return result.rows;
}


function compute(computeData, funInfo, interact_type){
    if(interact_type == 'only_show'){
        return computeData[0]
    }

    let r = 0;
    let sum = 0;
    
    switch (funInfo.funName) {


        //一元函数
        case 'func1':
            r = funInfo.func1(computeData[0])
        break;
        
        case 'boxcox_0':
            r = funInfo.boxcox_0(computeData[0]);
        break;

        case 'boxcox_1_2':
            r = funInfo.boxcox_1_2(computeData[0]);
        break;

        case 'boxcox_1':
            r = funInfo.boxcox_1(computeData[0]);
        break;

        case 'boxcox_2':
            r = funInfo.boxcox_2(computeData[0]);
        break;

        case 'sin':
            r = Math.sin(computeData[0]);
        break;


        // 二元函数
        case 'func4':
            let x = computeData[0]
            let y = computeData[1]
            r = (1 - Math.sin(x)) * (Math.log(Math.abs(y)+1)) **2
        break;

        case '+':
            for (let i = 0; i < computeData.length; i++) {
                r += computeData[i]
            }
        break;

        case '-':
            r = computeData[0];
            for (let i = 1; i < computeData.length; i++) {
                r -= computeData[i]
            }
        break;

        case '*':
            r = computeData[0];
            for (let i = 1; i < computeData.length; i++) {
                r = r * computeData[i]
            }
        break;

        case '/':
            r = computeData[0];
            for (let i = 1; i < computeData.length; i++) {
                if(computeData[i] == 0){
                    r=0
                }else{
                    r /= computeData[i]
                }
            }
        break;

        case 'x^y':
            r = computeData[0] ** computeData[1];
        break;

        case '(1-x^3)(1-y^3)^2':
            r = ((1 - computeData[0] ** 3) * (1 - computeData[1] ** 3)) ** 2;
        break;

        // 多元函数
        case 'mean':
            for (let i = 0; i < computeData.length; i++) {
                r += computeData[i]
            }
            r /= computeData.length;
        break;

        case 'variance':
            let mean = 0;
            for (let i = 0; i < computeData.length; i++) {
                mean += computeData[i]
            }
            mean /= computeData.length;

            for (let i = 0; i < computeData.length; i++) {
                r += (computeData[i] - mean) ** 2
            }
            r /= computeData.length;
        break;

        case 'weightsum':
            let weights = funInfo.weights
            sum = 0;
            for (let i = 0; i < computeData.length; i++) {
                sum += weights[i]*computeData[i]
            }
            r=sum
        break;

        case 'L2':
            sum = 0;
            for (let i = 0; i < computeData.length; i++) {
                sum += computeData[i]*computeData[i]
            }
            r=Math.sqrt(sum) 
        break;

        case 'max':
            r = Math.max(...computeData)
        break;

        

    }

    return r;
    
}

function removeEndChar(str, charToRemove) {
    const regex = new RegExp(charToRemove + '$'); // 创建正则表达式，匹配结尾的字符
    return str.replace(regex, ''); // 替换为空字符串
}

// 两表分别从数据库取出来，程序做加法，程序做M4
async function Case1(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){

    console.log('Case1')
    //console.log(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4)

     //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
     symbol = symbol.split(';')
     if (symbol.length > 1) {
         params = symbol[1].split(',')
     } else {
         params = []
     }

     let funInfo = new FunInfo(symbol[0],params)



    let table = mergeTables(table_name,columns,funInfo, 'tv')
    let results = []

    


    let M4_arrays = [];
    let min_values = [];
    let max_values = [];

    let dataLength = 0

    let sql = `select t `
    for(let i=0;i<columns.length;i++){
        sql = `${sql},${columns[i]} `
    }

    sql = `${sql} from ${table_name} `
    if (endTime >= 0){
        sql = sql.concat(`where t between ${startTime} and ${endTime} `);
    }
    sql = sql.concat('order by t asc')
    console.log(`sql: ${sql}\n`);


    timestart("readTableBFromDB")
    let r = await readTableBFromDB(sql)
    timeend("readTableBFromDB")

    startTime = r[0][0];
    endTime = r[r.length - 1][0];
    //console.log(r)

    timestart("compute")
    let result = []
    for(let i=0;i<r.length;i++){
        let computeData = []
        for(let j=0;j<columns.length;j++){
            //第一列为t，往后为v1、v2...
            computeData.push(r[i][j+1])
        }

        let v = compute(computeData, funInfo, interact_type)
        let pair = { t: r[i][0], v: v };

        result.push(pair)

    }
    timeend("compute")



    if(mode == 'multi'){
        for(let i=0;i<results.length;i++){
            let result =results[i]
            let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);
            M4_arrays.push(M4_array);
            min_values.push(min_value);
            max_values.push(max_value);

        }
    
        return {
            M4_array: M4_arrays,
            min_value: min_values,
            max_value: max_values
        }
    }


    timestart("generateM4")
    let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);
    timeend("generateM4")

    M4_arrays.push(M4_array);
    min_values.push(min_value);
    max_values.push(max_value);

    screen_m4.M4_array = M4_array
    screen_m4.dataReductionRatio =0


    return {
        M4_array: M4_arrays,
        min_value: min_values,
        max_value: max_values
    }

}


 // 在数据库：两表在数据相加后，对结果做M4
 async function Case2(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){
    //console.log('Case2')

    //console.log(table_name1,table_name_others,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type)
     //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
     symbol = symbol.split(';')
     if (symbol.length > 1) {
         params = symbol[1].split(',')
     } else {
         params = []
     }



     let funInfo = new FunInfo(symbol[0],params)
     symbol = funInfo.funName
     let weights = funInfo.weights

     table_name = mergeTables(table_name,columns,funInfo, 'tv')


     let column1 = columns[0];
     let column_others = columns.slice(1);
 
 
 
      if(endTime < 0){
         let sql = `select count(*) as c from ${table_name}`
         let result1 = await pool.query(sql);
         
         let num = result1.rows[0].c
 
         endTime = num-1
      }
 
 
     let sql_query = `WITH Q AS (select t as t, `
 
     if (symbol == '+' | symbol == '-' | symbol == '*'){
         sql_query = sql_query.concat(`(${column1}`);
         column_others.forEach(order => {
             sql_query = sql_query.concat(` ${symbol} ${order}`)
         });
         sql_query = sql_query.concat(`) AS v
             from ${table_name} `);
     } else if (symbol == '/'){
         sql_query = sql_query.concat(`(COALESCE(${column1}`);
         column_others.forEach(order => {
             sql_query = sql_query.concat(` ${symbol} nullif(${order}, 0)`)
         });
         sql_query = sql_query.concat(`, 0))AS v
             from ${table_name} `);
     }else if (symbol == 'mean'){
         let weight = 1 / (column_others.length + 1);
         sql_query = sql_query.concat(`${weight} * ${column1}`);
         column_others.forEach(order => {
             sql_query = sql_query.concat(` + ${weight} * ${order}`)
         });
         sql_query = sql_query.concat(` AS v
             from ${table_name} `);
     } else if (symbol == 'variance'){
         let weight = 1 / (column_others.length + 1);
         let mean = `(${weight} * ${column1}`;
         column_others.forEach(order => {
             mean = mean.concat(` + ${weight} * ${order}`)
         });
         mean = mean.concat(`)`);
         sql_query = sql_query.concat(`${weight} * (${column1} - ${mean})^2`);
         column_others.forEach(order => {
             sql_query = sql_query.concat(` + ${weight} * (${order} - ${mean})^2`)
         });
         sql_query = sql_query.concat(` AS v
             from ${table_name} `);
     } else if (symbol == 'boxcox_0'){
         sql_query = sql_query.concat(`COALESCE(LN(nullif(${column1}, 0)), 0) as v from ${table_name}\n`);
     } else if (symbol == 'boxcox_1_2'){
         sql_query = sql_query.concat(`(sqrt(${column1})-1) * 2 as v from ${table_name}\n`);
     } else if (symbol == 'boxcox_1'){
         sql_query = sql_query.concat(`${column1}-1 as v from ${table_name}\n`);
     } else if (symbol == 'boxcox_2'){
         sql_query = sql_query.concat(`(power(${column1}, 2)-1) / 2 as v from ${table_name}\n`);
     } else if (symbol == 'func1'){
         sql_query = sql_query.concat(`0.001 * power(${column1}, 3) - 3 * ${column1} as v from ${table_name}\n`);
     } else if (symbol == 'func4'){
         sql_query = sql_query.concat(`(1-sin(${column1}))*power(LN(abs(${column_others[0]})+1), 2) as v from ${table_name} `);
     } else if (symbol == 'weightsum'){
        sql_query = sql_query.concat(`${weights[0]} * ${column1}`);
        column_others.forEach((order, idx) => {
            sql_query = sql_query.concat(` + (${weights[idx + 1]}) * (${order})`);
        });
        sql_query = sql_query.concat(` AS v from ${table_name} `);
     } else if (symbol == 'L2'){
        sql_query = sql_query.concat(`SQRT(${column1} * ${column1}`);
        column_others.forEach(order => {
            sql_query = sql_query.concat(` + ${order} * ${order}`)
        });
        sql_query = sql_query.concat(` ) AS v
            from ${table_name} `);
     } else if (symbol == 'max'){
        sql_query = sql_query.concat(`greatest(${column1}`);
        column_others.forEach(order => {
            sql_query = sql_query.concat(`, ${order}`)
        });
        sql_query = sql_query.concat(`) AS v
            from ${table_name} `);
     } else if (symbol == 'min'){
        sql_query = sql_query.concat(`least(${column1}`);
        column_others.forEach(order => {
            sql_query = sql_query.concat(`, ${order}`)
        });
        sql_query = sql_query.concat(`) AS v
            from ${table_name} `);
     }
 
     sql_query = sql_query.concat(`where t between ${startTime} and ${endTime})\n`);
 
     let sql_getM4 = `SELECT t,v,v_min,v_max FROM Q JOIN
                 (SELECT floor(${width}*(t-${startTime})::bigint / (${endTime}-${startTime}+1)) AS k,
                        min(v) AS v_min, max(v) AS v_max,
                        min(t) AS t_min, max(t) AS t_max
                  FROM Q GROUP BY k) AS QA
             ON k = round(${width}*(t-${startTime})::bigint / (${endTime}-${startTime}+1))
                 AND (t = t_min OR t = t_max)
                     order by t asc `
     
     sql = sql_query.concat(sql_getM4);
 
     console.log(`sql: ${sql}`);

     timestart('SQL.query.time');
     result1 = await pool.query(sql);
     timeend('SQL.query.time');
 
    //  result1.rows.forEach(r => {
    //      console.log(r)
    //  })
 
    let M4_array = []
    let MIN = Infinity;
    let MAX = -Infinity;
 
    for (let i = 0; i < result1.rows.length; i += 2) {

        result1.rows[i].v_min ??= 0;
        result1.rows[i].v_max ??= 0;
        result1.rows[i].v ??= 0;
        result1.rows[i + 1].v ??= 0;

        result1.rows[i].v_min = Math.min(result1.rows[i].v_min,result1.rows[i].v_max,result1.rows[i].v,result1.rows[i+1].v)
        result1.rows[i].v_max = Math.max(result1.rows[i].v_min,result1.rows[i].v_max,result1.rows[i].v,result1.rows[i+1].v)

        let pair = {
            start_time: result1.rows[i].t, end_time: result1.rows[i + 1].t,
            min: result1.rows[i].v_min, max: result1.rows[i].v_max,
            st_v: result1.rows[i].v, et_v: result1.rows[i + 1].v
        }

        if (pair.min < MIN) { MIN = pair.min; }
        if (pair.max > MAX) { MAX = pair.max; }

        M4_array.push(pair);
    }
 
    screen_m4.M4_array = M4_array
    screen_m4.dataReductionRatio =0


     return {
         M4_array: M4_array,
         min_value: MIN,
         max_value: MAX
     }

 

}




//     let result1,result2

//     if(isNaN(screenStart) || isNaN(screenEnd)){
//         let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1} order by t asc `
//          result1 = await pool.query(sql);
//         sql = `SELECT ${table2}.t AS t, ${table2}.v AS v FROM ${table2} order by t asc`
//          result2 = await pool.query(sql);
//     }else {
//         let sql = `SELECT ${table1}.t AS t, ${table1}.v AS v FROM ${table1} where t>=${screenStart} and t<= ${screenEnd} order by t asc `
//          result1 = await pool.query(sql);
//         sql = `SELECT ${table2}.t AS t, ${table2}.v AS v FROM ${table2}  where t>=${screenStart} and t<= ${screenEnd} order by t asc`
//          result2 = await pool.query(sql);
//     }


//     screenStart = result1.rows[0].t
//     screenEnd = result1.rows[result2.rows.length-1].t

//     // todo 两表相加，并输出width的M4数组
//     let t3 = new Array(result2.rows.length)

//     switch(symbol){
//         case '+':
//             for(let i=0;i<result1.rows.length;i++){
//                 let t=result1.rows[i].t
//                 let v = (result1.rows[i].v + result2.rows[i].v)

//                 //console.log(result1.rows[i].v , result2.rows[i].v,result1.rows[i].v + result2.rows[i].v)
                
//                 let pair = { t: t, v: v };
//                 t3[i] = pair
//             };
//             break;
//         case '-':
//             for(let i=0;i<result1.rows.length;i++){
//                 let t=result1.rows[i].t
//                 let v = (result1.rows[i].v - result2.rows[i].v)
                
//                 let pair = { t: t, v: v };
//                 t3[i] = pair
//             };
//             break;
//         case '*':
//             for(let i=0;i<result1.rows.length;i++){
//                 let t=result1.rows[i].t
//                 let v = (result1.rows[i].v * result2.rows[i].v)
                
//                 let pair = { t: t, v: v };
//                 t3[i] = pair
//             }
//             break;
//         case '/':
//             for(let i=0;i<result1.rows.length;i++){
//                 let t=result1.rows[i].t
//                 let v = (result1.rows[i].v / result2.rows[i].v)
                
//                 let pair = { t: t, v: v };
//                 t3[i] = pair
//             }
//             break;
//     }


//     let num = t3.length


//     let PARTITION = Math.floor(num/width)

//     let res = computeM4TimeSE(width, [screenStart, screenEnd])
//     // let min_arr = []
//     // let max_arr = []
//     res.forEach(e =>{
//         let min = Infinity;
//         let max = -Infinity;
//         for(let i = e.start_time-screenStart; i <= e.end_time-screenStart; i++){

//             if(t3[i].v < min){
//                 min = t3[i].v
//             }

//             if(t3[i].v > max){
//                 max = t3[i].v
//             }
//         }
//         e.min = min
//         e.max = max
//         e.st_v = t3[e.start_time-screenStart].v
//         e.et_v = t3[e.end_time-screenStart].v
//     })


//     return res;
// }






 // 在数据库：两表在数据相加后，对结果做M4
 async function Case2_old(table1, table2, width, symbol){
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
                             (${table1}.${symbol}${table2}.v) AS v 
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

    console.log(result1.rows)

    //console.log(result1.rows)

 }


 async function sympleInitM4(segmentTrees,M4_array,func, mode, parallel, screen_m4) {

    for(let i=0;i<M4_array.length;i++){
        let m4 = M4_array[i]
        
        
        m4.st_v = m4.stNodes[0].min
        m4.et_v = m4.etNodes[0].min


        if (M4_array[i].st_v < M4_array[i].et_v) {
            M4_array[i].min = M4_array[i].st_v
            M4_array[i].max = M4_array[i].et_v

        } else {
            M4_array[i].min = M4_array[i].et_v
            M4_array[i].max = M4_array[i].st_v
        }


        //计算inner node
        //将m4.innerNodes全部放入候选队列
        for(let j=0;j<M4_array[i].innerNodes.length;j++){
            let nodePairs = M4_array[i].innerNodes[j]

            //let {tmpmin,tmpmax}=unifiedCalulate(segmentTrees, nodePairs, func, mode, false)
            let tmpmin = nodePairs[0].min
            let tmpmax = nodePairs[0].max

            if(tmpmax > M4_array[i].max){
                M4_array[i].max = tmpmax
            }

            if(tmpmin < M4_array[i].min){
                M4_array[i].min = tmpmin
            }
        }
    }
    
}


function getMinMaxOfM4(M4_array) {
    let min_value = Infinity;
    let max_value = -Infinity;
    for (let i = 0; i < M4_array.length; i++) {
        let m4 = M4_array[i];

        min_value = Math.min(min_value, m4.st_v, m4.et_v, m4.min, m4.max);
        max_value = Math.max(max_value, m4.st_v, m4.et_v, m4.min, m4.max);
    }
    return { min_value, max_value };
}

function computeForM4(width, screenStart, screenEnd, M4_arrays, funInfo, interact_type) {
    let M4_array = computeM4TimeSE(width, [screenStart, screenEnd]);

    for (let i = 0; i < width; i++) {

        //stv
        let currentNodes = [];
        for (let j = 0; j < M4_arrays.length; j++) {
            currentNodes.push(M4_arrays[j][i].st_v);
        }
        M4_array[i].st_v = compute(currentNodes, funInfo, interact_type);

        //etv
        currentNodes = [];
        for (let j = 0; j < M4_arrays.length; j++) {
            currentNodes.push(M4_arrays[j][i].et_v);
        }
        M4_array[i].et_v = compute(currentNodes, funInfo, interact_type);

        // //min
        // currentNodes = [];
        // for (let j = 0; j < M4_arrays.length; j++) {
        //     currentNodes.push(M4_arrays[j][i].min);
        // }
        // M4_array[i].min = compute(currentNodes, funInfo, interact_type);

        // //max
        // currentNodes = [];
        // for (let j = 0; j < M4_arrays.length; j++) {
        //     currentNodes.push(M4_arrays[j][i].max);
        // }
        // M4_array[i].max = compute(currentNodes, funInfo, interact_type);

        //min max together
        currentNodes = []
        for (let j = 0; j < M4_arrays.length; j++) {
            let node = new SegmentTreeNode();
            node.min = M4_arrays[j][i].min
            node.max = M4_arrays[j][i].max
            currentNodes.push(node)
        }
        let {tmpmin,tmpmax}=unifiedCalulate(null, currentNodes, funInfo, null, false)
        M4_array[i].max=tmpmax
        M4_array[i].min=tmpmin
    }
    return M4_array;
}

 // 在数据库：两表做M4，对M4相加，OM3结构数据表
 async function Case3(table_name,dataCount,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){

    console.log('Case3')


    let screenStart = startTime
    let screenEnd = endTime

   //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
   symbol = symbol.split(';')
   if(symbol.length > 1){
       params = symbol[1].split(',')
   }else{
       params = []
   }

   let funInfo = new FunInfo(symbol[0],params)


   let table = mergeTables(table_name,columns,funInfo,'om3')
    
    let segmentTrees = []

    let M4_arrays = []
    for(let i=0;i<columns.length;i++){

        let treeName=`${table}_OM3_${columns}_${columns[i]}`

        if(treeName in treeCache){
            console.log(treeName,' exists.')
        }else{
            treeCache[treeName] = await buildtree(table,dataCount,columns,i, width, screenStart,screenEnd)
        }

        treeCache[treeName].nodeCountDelta = 0
        treeCache[treeName].belongsToScreen = screen_m4
        treeCache[treeName].maxNodeNum = MAXNODENUM
        treeCache[treeName].funInfo = funInfo

        segmentTrees.push(treeCache[treeName])


    }

    let realDataRowNum = getRealDataRowNum(segmentTrees[0], segmentTrees[0])
    if(isNaN(screenStart) || screenStart < 0){
        screenStart = 0
    }
    if(isNaN(screenEnd) || screenEnd<0 || screenEnd > realDataRowNum-1){
        screenEnd = realDataRowNum-1
    }

    for(let i=0;i<columns.length;i++){

        let M4_array = computeM4TimeSE(width, [screenStart, screenEnd])

        await fenlie(M4_array, screenStart,screenEnd, [segmentTrees[i]], funInfo, []);
        sympleInitM4([segmentTrees[i]],M4_array,funInfo, mode, parallel, null)
    
        M4_arrays.push(M4_array)

    }


    let M4_array = computeForM4(width, screenStart, screenEnd, M4_arrays, funInfo, interact_type);





     M4_arrays = []
    let min_values = [];
    let max_values = [];
    let { min_value, max_value } = getMinMaxOfM4(M4_array);

    //let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);

    M4_arrays.push(M4_array);
    min_values.push(min_value);
    max_values.push(max_value);


    screen_m4.M4_array = M4_array
    screen_m4.dataReductionRatio = 1 - segmentTrees[0].nodeCount*2 / segmentTrees[0].realDataNum

    return {
        M4_array: M4_arrays,
        min_value: min_values,
        max_value: max_values
    }


 }

 // 在数据库：两表做M4，对M4相加，t-v结构数据表
 async function Case4(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){

    console.log('Case4')


   //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
   symbol = symbol.split(';')
   if(symbol.length > 1){
       params = symbol[1].split(',')
   }else{
       params = []
   }

   let funInfo = new  FunInfo(symbol[0],params)
   symbol = funInfo.funName

   let table = mergeTables(table_name,columns,funInfo,'tv')
    if (endTime < 0) {
        let sql = `select count(*) as c from ${table}`

        timestart('SQL.query.time');
        let result1 = await pool.query(sql);
        timeend('SQL.query.time');

        let num = result1.rows[0].c

        endTime = num - 1
    }

    let screenStart = startTime
    let screenEnd = endTime

    // 构建 SQL 查询
    let sql_getM4 = `
    SELECT t, ${columns.map(column => `${column}`).join(", ")}, ${columns.map(column => `${column}_min, ${column}_max`).join(", ")} 
    FROM ${table}
    JOIN (
        SELECT round(${width} * (t - ${startTime})::bigint / (${endTime} - ${startTime} + 1)) AS k,
            ${columns.map(column => `min(${column}) AS ${column}_min, max(${column}) AS ${column}_max`).join(", ")},
            min(t) AS t_min, max(t) AS t_max
        FROM ${table} WHERE t BETWEEN ${startTime} AND ${endTime} GROUP BY k) AS QA
    ON k = round(${width} * (t - ${startTime})::bigint / (${endTime} - ${startTime} + 1))
    AND (t = t_min OR t = t_max)
    ORDER BY t ASC;
    `;
    console.log(sql_getM4)

    timestart('SQL.query.time');
    let result = await pool.query(sql_getM4);
    timeend('SQL.query.time');

    let M4_arrays = []
    for (let i = 0; i < columns.length; i++){
        M4_arrays.push([])
    }

    for (let i = 0; i < result.rows.length; i+=2){
        for(j=0;j<columns.length; j++){
            let column = columns[j]
        
            // 取出每个字段及其对应的最小值和最大值
            let pair = {
                start_time:result.rows[i].t
                , end_time:result.rows[i+1].t
                , min:result.rows[i][`${column}_min`]
                , max:result.rows[i][`${column}_max`]
                , st_v:result.rows[i][column]
                , et_v:result.rows[i+1][column]
            }

            M4_arrays[j].push(pair)

        }
    }


    let M4_array = computeForM4(width, screenStart, screenEnd, M4_arrays, funInfo, interact_type);
    

    M4_arrays = []
    let min_values = [];
    let max_values = [];
    let { min_value, max_value } = getMinMaxOfM4(M4_array);

    //let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);

    M4_arrays.push(M4_array);
    min_values.push(min_value);
    max_values.push(max_value);


    screen_m4.M4_array = M4_array
    screen_m4.dataReductionRatio = 1 - width*4 / (endTime-startTime+1)

    return {
        M4_array: M4_arrays,
        min_value: min_values,
        max_value: max_values
    }



}

//  async function Case4(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){

//     console.log('Case4')


//    //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
//    symbol = symbol.split(';')
//    if(symbol.length > 1){
//        params = symbol[1].split(',')
//    }else{
//        params = []
//    }

//    let funInfo = new  FunInfo(symbol[0],params)
//    symbol = funInfo.funName

//    let table = mergeTables(table_name,columns,funInfo,'tv')
//     if (endTime < 0) {
//         let sql = `select count(*) as c from ${table}`

//         timestart('SQL.query.time');
//         let result1 = await pool.query(sql);
//         timeend('SQL.query.time');

//         let num = result1.rows[0].c

//         endTime = num - 1
//     }

//     let screenStart = startTime
//     let screenEnd = endTime

    
//     let M4_arrays = []
//     for (let i = 0; i < columns.length; i++){


//         let sql_getM4 = `SELECT t,${columns[i]} as v,v_min,v_max FROM ${table} JOIN
//         (SELECT round(${width}*(t-${startTime})::bigint / (${endTime}-${startTime}+1)) AS k,
//                min(${columns[i]}) AS v_min, max(${columns[i]}) AS v_max,
//                min(t) AS t_min, max(t) AS t_max
//         FROM ${table} WHERE t BETWEEN ${startTime} AND ${endTime} GROUP BY k) AS QA
//         ON k = round(${width}*(t-${startTime})::bigint / (${endTime}-${startTime}+1))
//             AND (t = t_min OR t = t_max)
//         order by t asc `


//         //console.log(`sql: ${sql}`);

//         timestart('SQL.query.time');
//         let result1 = await pool.query(sql_getM4);
//         timeend('SQL.query.time');

//         let M4_array = []
//         for (let i = 0; i < result1.rows.length; i+=2){

//              result1.rows[i].v_min ??= 0;
//              result1.rows[i].v_max ??= 0;
//              result1.rows[i].v ??= 0;
//              result1.rows[i+1].v ??= 0;
    
//              result1.rows[i].v_min = Math.min(result1.rows[i].v_min,result1.rows[i].v_max,result1.rows[i].v,result1.rows[i+1].v)
//              result1.rows[i].v_max = Math.max(result1.rows[i].v_min,result1.rows[i].v_max,result1.rows[i].v,result1.rows[i+1].v)
    

             

//             let pair = {start_time:result1.rows[i].t, end_time:result1.rows[i+1].t, 
//                 min:result1.rows[i].v_min, max:result1.rows[i].v_max, 
//                 st_v:result1.rows[i].v, et_v:result1.rows[i+1].v}
                
//             // if (pair.min < MIN) {MIN = pair.min;}
//             // if (pair.max > MAX) {MAX = pair.max;}
            
//             M4_array.push(pair);
//         }

//         M4_arrays.push(M4_array)
//     }

//     let M4_array = computeForM4(width, screenStart, screenEnd, M4_arrays, funInfo, interact_type);


//     M4_arrays = []
//     let min_values = [];
//     let max_values = [];
//     let { min_value, max_value } = getMinMaxOfM4(M4_array);

//     //let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);

//     M4_arrays.push(M4_array);
//     min_values.push(min_value);
//     max_values.push(max_value);


//     screen_m4.M4_array = M4_array
//     screen_m4.dataReductionRatio = 1 - width*4 / (endTime-startTime+1)

//     return {
//         M4_array: M4_arrays,
//         min_value: min_values,
//         max_value: max_values
//     }



// }


// 数据库做加法，数据库做M4 -----influxDB
async function Case5(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){

    console.log('Case5')
   
    //console.log(table_name1,table_name_others,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type)
     //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
     symbol = symbol.split(';')
     if (symbol.length > 1) {
         params = symbol[1].split(',')
     } else {
         params = []
     }

     let funInfo = new FunInfo(symbol[0],params)
     symbol = funInfo.funName

     let tableName = mergeTables(table_name,columns,funInfo, 'tv')



    const influxUrl = dbConfig['influxUrl'];
    const token = dbConfig['token'];
    const org = dbConfig['org'];
    const bucket = dbConfig['bucket'];

    const { InfluxDB } = require('@influxdata/influxdb-client');
    //创建 InfluxDB 客户端实例
    const influxDB = new InfluxDB({
        url: influxUrl,
        token: token,
        timeout: 24*60*60*1000  // 增加超时时间，例如60秒
    })
    // 创建查询客户端
    const queryApi = influxDB.getQueryApi(org);


    // for test!!!!!!!!
    //tableName = 'little'
    //endTime = -1

    if(endTime < 0){
        let rows = await getTime(queryApi, bucket, tableName);

        let { starttime, endtime } = timeSE(rows);

        startTime = starttime;
        endTime = endtime;
        console.log('Start Time:', startTime, 'End Time:', endTime);
     }else{
        let date = new Date(startTime*1000);
        let isoString = date.toISOString().split('.')[0] + 'Z';
        startTime = isoString

        date = new Date(endTime*1000);
        isoString = date.toISOString().split('.')[0] + 'Z';
        endTime = isoString
     }

    try {
        // 计算窗口持续时间
        const windowDuration = calculateWindowDuration(startTime, endTime, width);
        console.log(`Calculated window duration: ${windowDuration}`);

        // 构建 Flux 查询
        const fluxQuery = buildFluxQueryUsingWindow(bucket, tableName, columns, symbol,funInfo, startTime, endTime, windowDuration);
        console.log(`Constructed Flux Query:\n${fluxQuery}`);

        // 执行查询
        timestart('SQL.query.time');
        const tables = await queryApi.collectRows(fluxQuery);
        timeend('SQL.query.time');

        //console.log(`Number of Records Returned: ${tables.length}`);
        //console.log(tables)
        // 分组结果
        const groupedResults = groupResultsByYield(tables);
    

        let M4_array = []
        // for (let i = 0; i < tables.length / 4; i++) {
        //     let pair = {
        //         start_time:groupedResults.t_first[i].t, 
        //         st_v:      groupedResults.t_first[i].computed,
        //         end_time:  groupedResults.t_last[i].t,
        //         et_v:      groupedResults.t_last[i].computed,
        //         min:       groupedResults.v_min[i].computed,
        //         max:       groupedResults.v_max[i].computed
        //     }

        //     M4_array.push(pair);

        // }


        let previousEndTime = 0;

for (let i = 0; i < tables.length / 4; i++) {
    // 获取当前时间戳（单位：秒）
    let rawEndTime = new Date(groupedResults.t_last[i]._time).getTime() / 1000;
    let endTime;

    // 判断是否是整数
    if (Number.isInteger(rawEndTime)) {
        endTime = rawEndTime - 1;
    } else {
        endTime = Math.floor(rawEndTime);
    }

    let pair = {
        start_time: i === 0 ? 0 : previousEndTime + 1,
        st_v: groupedResults.t_first[i].computed,
        end_time: endTime,
        et_v: groupedResults.t_last[i].computed,
        min: groupedResults.v_min[i].computed,
        max: groupedResults.v_max[i].computed
    };

    M4_array.push(pair);
    previousEndTime = endTime;
}


        let M4_arrays = []
        let min_values = [];
        let max_values = [];
        let { min_value, max_value } = getMinMaxOfM4(M4_array);
    
        //let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);
    
        M4_arrays.push(M4_array);
        min_values.push(min_value);
        max_values.push(max_value);
    
    
        screen_m4.M4_array = M4_array
        screen_m4.dataReductionRatio = 0 //1 - width*4 / (endTime-startTime+1)
    
        return {
            M4_array: M4_arrays,
            min_value: min_values,
            max_value: max_values
        }


    } catch (error) {
        console.error('Error:', error);
    }




 }


/**
 * 构建 Flux 查询，使用动态运算表达式
 */
function buildFluxQueryUsingWindow_multi(bucket, tableName, vColumns, symbol, startTime, endTime, windowDuration) {
    let fluxQueries = [];



    vColumns.forEach(column => {
        // 生成针对当前列的聚合计算


        const v_min = `
        ${column}_v_min = from(bucket: "${tableName}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r["_field"] == "${column}" )
          |> aggregateWindow(every: ${windowDuration}, fn: min, createEmpty: false)
          |> yield(name: "${column}_v_min")
        `;



        const v_max = `
        ${column}_v_max = from(bucket: "${tableName}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r["_field"] == "${column}" )
          |> aggregateWindow(every: ${windowDuration}, fn: max, createEmpty: false)
          |> yield(name: "${column}_v_max")
        `;

        const v_first = `
        ${column}_v_first = from(bucket: "${tableName}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r["_field"] == "${column}" )
          |> aggregateWindow(every: ${windowDuration}, fn: first, createEmpty: false)
          |> yield(name: "${column}_v_first")
        `;

        const v_last = `
        ${column}_v_last = from(bucket: "${tableName}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r["_field"] == "${column}" )
          |> aggregateWindow(every: ${windowDuration}, fn: last, createEmpty: false)
          |> yield(name: "${column}_v_last")
        `;



        // 将生成的查询添加到数组中
        fluxQueries.push(v_min, v_max, v_first, v_last);
        //fluxQueries.push(v_min);
    });

    // 将所有子查询组合成最终的 Flux 查询
    const flux = fluxQueries.join('\n');

    return flux.trim();
}

function groupResultsByYield_multi(rows) {
    const grouped = {};

    rows.forEach(row => {
        const yieldName = row.result;

        // 使用正则表达式来拆分 "temperature_v_min" -> ["temperature", "v_min"]
        const match = yieldName.match(/([a-zA-Z0-9_]+)_(v_min|v_max|v_first|v_last)/);

        if (match) {
            const columnName = match[1];  // "temperature"
            const resultType = match[2];   // "v_min", "v_max", "t_first", or "t_last"

            if (!grouped[columnName]) {
                grouped[columnName] = {};
            }

            if (!grouped[columnName][resultType]) {
                grouped[columnName][resultType] = [];
            }

            // 将行数据添加到对应的分组
            grouped[columnName][resultType].push(row);
        }
    });

    return grouped;
}

// 数据库做M4 ,M4做加法，-----influxDB
async function Case6(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){

    console.log('Case6')
   
    //console.log(table_name1,table_name_others,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type)
     //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
     symbol = symbol.split(';')
     if (symbol.length > 1) {
         params = symbol[1].split(',')
     } else {
         params = []
     }

     let funInfo = new FunInfo(symbol[0],params)
     symbol = funInfo.funName

     let tableName = mergeTables(table_name,columns,funInfo, 'tv')


     let column1 = columns[0];
     let column_others = columns.slice(1);
  
 



    const influxUrl = dbConfig['influxUrl'];
    const token = dbConfig['token'];
    const org = dbConfig['org'];
    const bucket = dbConfig['bucket'];

    const { InfluxDB } = require('@influxdata/influxdb-client');
    //创建 InfluxDB 客户端实例
    const influxDB = new InfluxDB({
        url: influxUrl,
        token: token,
        timeout: 24*60*60*1000  // 增加超时时间，例如60秒
    })
    // 创建查询客户端
    const queryApi = influxDB.getQueryApi(org);


    // for test!!!!!!!!
    //tableName = 'little'

    if(endTime < 0){
        let rows = await getTime(queryApi, bucket, tableName);

        let { starttime, endtime } = timeSE(rows);

        startTime = starttime;
        endTime = endtime;
        console.log('Start Time:', startTime, 'End Time:', endTime);
     }else{
        let date = new Date(startTime*1000);
        let isoString = date.toISOString().split('.')[0] + 'Z';
        startTime = isoString

        date = new Date(endTime*1000);
        isoString = date.toISOString().split('.')[0] + 'Z';
        endTime = isoString
     }


     let screenStart = new Date(startTime);
     let screenEnd = new Date(endTime);
     screenStart = Math.floor(screenStart.getTime()/1000)
     screenEnd = Math.floor(screenEnd.getTime()/1000)

    try {
        // 计算窗口持续时间
        const windowDuration = calculateWindowDuration(startTime, endTime, width);
        console.log(`Calculated window duration: ${windowDuration}`);

        // 构建 Flux 查询
        const fluxQuery = buildFluxQueryUsingWindow_multi(bucket, tableName, columns, symbol, startTime, endTime, windowDuration);
        console.log(`Constructed Flux Query:\n${fluxQuery}`);

        // 执行查询
        timestart('SQL.query.time');
        const tables = await queryApi.collectRows(fluxQuery);
        timeend('SQL.query.time');

        //console.log(`Number of Records Returned: ${tables.length}`);
        //console.log(tables)
        // 分组结果
        const groupedResults = groupResultsByYield_multi(tables);
    
        //console.log(groupedResults)

        let M4_arrays = []
        for (let i = 0; i < columns.length; i++){

            let M4_array = computeM4TimeSE(width, [screenStart, screenEnd])

            for(let j=0;j<width;j++){

                M4_array[j].st_v = groupedResults[columns[i]]['v_first'][j]["_value"]
                M4_array[j].et_v = groupedResults[columns[i]]['v_last'][j]["_value"]
                M4_array[j].min = groupedResults[columns[i]]['v_min'][j]["_value"]
                M4_array[j].max = groupedResults[columns[i]]['v_max'][j]["_value"]
            }

            M4_arrays.push(M4_array)
        }

        let M4_array = computeForM4(width, screenStart, screenEnd, M4_arrays, funInfo, interact_type);

        M4_arrays = []
        let min_values = [];
        let max_values = [];
        let { min_value, max_value } = getMinMaxOfM4(M4_array);
    
        //let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);
    
        M4_arrays.push(M4_array);
        min_values.push(min_value);
        max_values.push(max_value);
    
    
        screen_m4.M4_array = M4_array
        screen_m4.dataReductionRatio = 1 - width*4 / (screenEnd-screenStart+1)  //(endTime-startTime+1)
    
        return {
            M4_array: M4_arrays,
            min_value: min_values,
            max_value: max_values
        }


    } catch (error) {
        console.error('Error:', error);
    }




 }


 // 数据库做M4，程序在M4上做加法 -----influxDB
async function Case6_test(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){

    console.log('Case6')
   
    //console.log(table_name1,table_name_others,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type)
     //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
     symbol = symbol.split(';')
     if (symbol.length > 1) {
         params = symbol[1].split(',')
     } else {
         params = []
     }

     let funInfo = new FunInfo(symbol[0],params)
     symbol = funInfo.funName

     let tableName = mergeTables(table_name,columns,funInfo, 'tv')


     let column1 = columns[0];
     let column_others = columns.slice(1);
  
 



    const influxUrl = dbConfig['influxUrl'];
    const token = dbConfig['token'];
    const org = dbConfig['org'];
    let bucket = dbConfig['bucket'];

    bucket = 'nycdata'

    const { InfluxDB } = require('@influxdata/influxdb-client');
    //创建 InfluxDB 客户端实例
    const influxDB = new InfluxDB({
        url: influxUrl,
        token: token,
        timeout: 24*60*60*1000  // 增加超时时间，例如60秒
    })
    // 创建查询客户端
    const queryApi = influxDB.getQueryApi(org);


    // for test!!!!!!!!
    //tableName = 'little'

    if(endTime < 0){
        let rows = await getTime(queryApi, bucket, tableName);

        let { starttime, endtime } = timeSE(rows);

        startTime = starttime;
        endTime = endtime;
        console.log('Start Time:', startTime, 'End Time:', endTime);

     }

     return 

    try {
        // 计算窗口持续时间
        const windowDuration = calculateWindowDuration(startTime, endTime, width);
        console.log(`Calculated window duration: ${windowDuration}`);

        // 构建 Flux 查询
        //or r["_field"] == "t"
        let fluxQuery1 = 
        `


        // v_max = from(bucket: "${bucket}")
        //     |> range(start: ${startTime}, stop: ${endTime})
        //     |> filter(fn: (r) => r["_measurement"] == "${tableName}"  and r["_field"] == "${columns[0]}")
        //     //|> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        //     |> aggregateWindow(every: ${windowDuration}, fn: max, createEmpty: false)
        //     |> yield(name: "v_max")

        // v_min = from(bucket: "${bucket}")
        //     |> range(start: ${startTime}, stop: ${endTime})
        //     |> filter(fn: (r) => r["_measurement"] == "${tableName}"  and r["_field"] == "${columns[0]}")
        //     //|> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        //     |> aggregateWindow(every: ${windowDuration}, fn: min, createEmpty: false)
        //     |> yield(name: "v_min")


        // t_first = from(bucket: "${bucket}")
        //     |> range(start: ${startTime}, stop: ${endTime})
        //     |> filter(fn: (r) => r["_measurement"] == "${tableName}"  and r["_field"] == "${columns[0]}")
        //     //|> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        //     |> aggregateWindow(every: ${windowDuration}, fn: first, createEmpty: false)
        //     |> yield(name: "t_first")

        // t_last = from(bucket: "${bucket}")
        //     |> range(start: ${startTime}, stop: ${endTime})
        //     |> filter(fn: (r) => r["_measurement"] == "${tableName}"  and r["_field"] == "${columns[0]}")
        //     //|> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        //     |> aggregateWindow(every: ${windowDuration}, fn: last, createEmpty: false)
        //     |> yield(name: "t_last")



pivoted = from(bucket: "influx")
    |> range(start: 1970-01-01T00:00:00Z, stop: 1970-02-24T18:47:59Z)
    |> filter(fn: (r) => r["_measurement"] == "nycdata" and (r["_field"] == "v7" or r["_field"] == "v9"))        
    |> group(columns: ["_time"])  // 按时间分组
    |> map(fn: (r) => ({
            r with
            v7_plus_v9: (if r._field == "v7" then r._value else 0.0) + (if r._field == "v9" then r._value else 0.0)
        }))
    |> group(columns: ["_time", "_field"]) // 重新分组

pivoted



 pivoted


        `
        let fluxQuery2 = `

        pivoted = from(bucket: "${bucket}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r["_measurement"] == "${tableName}")
          |> filter(fn: (r) => r["_field"] == "v7" or r["_field"] == "v9")
          |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
          |> map(fn: (r) => ({ r with computed: r.v7+r.v9 }))
    
    pivoted
    
    `
        
    let fluxQuery = fluxQuery2
        
        console.log(`Constructed Flux Query:\n${fluxQuery}`);

        // 执行查询
        timestart('SQL.query.time');
        const tables = await queryApi.collectRows(fluxQuery);
        timeend('SQL.query.time');

        console.log(`Number of Records Returned: ${tables.length}`);
        //console.log(tables)

        return 
        // 分组结果
        const groupedResults = groupResultsByYield(tables);
    

        let M4_array = []
        for (let i = 0; i < tables.length / 4; i++) {
            let pair = {
                start_time:groupedResults.t_first[i].t, 
                st_v:      groupedResults.t_first[i].computed,
                end_time:  groupedResults.t_last[i].t,
                et_v:      groupedResults.t_last[i].computed,
                min:       groupedResults.v_min[i].computed,
                max:       groupedResults.v_max[i].computed
            }

            M4_array.push(pair);

        }


        let M4_arrays = []
        let min_values = [];
        let max_values = [];
        let { min_value, max_value } = getMinMaxOfM4(M4_array);
    
        //let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);
    
        M4_arrays.push(M4_array);
        min_values.push(min_value);
        max_values.push(max_value);
    
    
        screen_m4.M4_array = M4_array
        screen_m4.dataReductionRatio = 1 - width*4 / (endTime-startTime+1)
    
        return {
            M4_array: M4_arrays,
            min_value: min_values,
            max_value: max_values
        }


    } catch (error) {
        console.error('Error:', error);
    }




 }



 function connectInfluxDB(influxUrl, token) {
    return new InfluxDB({ url: influxUrl, token, timeout:  24*60*60*1000 });
}


async function getTime(queryApi, bucket, table) {
    const query = `


min_time = from(bucket: "${table}")
  |> range(start: 0)  // 查询所有数据（从 1970-01-01 00:00:00 UTC 起）
  |> filter(fn: (r) => r._measurement == "${table}")  // 过滤指定的 _measurement
  |> first()
  |> rename(columns: {_time: "min_time"})  // 重命名 _time 为 min_time
  |> keep(columns: ["min_time"])  // 只保留 min_time 字段

max_time = from(bucket: "${table}")
  |> range(start: 0)  // 查询所有数据（从 1970-01-01 00:00:00 UTC 起）
  |> filter(fn: (r) => r._measurement == "${table}")  // 过滤指定的 _measurement
  |> last()
  |> rename(columns: {_time: "max_time"})  // 重命名 _time 为 max_time
  |> keep(columns: ["max_time"])  // 只保留 max_time 字段

min_time
  |> yield(name: "min_time")
max_time
  |> yield(name: "max_time")

    `;

    console.log(query)

    timestart('SQL.query.time');
    const rows = await queryApi.collectRows(query);
    timeend('SQL.query.time');

    //console.log(rows)
    return rows;

}

function timeSE(results) {
    let starttime = '';
    let endtime = '';
    for (let i = 0; i < results.length; i++) {
        if (results[i].result === 'max_time') {
            endtime = results[i].max_time;
        }
        if (results[i].result === 'min_time') {
            starttime = results[i].min_time;
        }
    }
    return { starttime, endtime };
}

/**
 * Calculate Window Duration
 * @param {string} startTime - Start time (ISO 8601)
 * @param {string} endTime - End time (ISO 8601)
 * @param {number} width - Number of windows
 * @returns {string} - Flux duration string
 */
function calculateWindowDuration(startTime, endTime, width) {
    const startDate = new Date(startTime).getTime();
    const endDate = new Date(endTime).getTime();
    const durationMs = endDate - startDate;
    const windowDurationMs = Math.floor(durationMs / width);

    console.log('Start Date (ms):', startDate, 'End Date (ms):', endDate, 'Duration (ms):', durationMs, 'Window Duration (ms):', windowDurationMs);

    return `${windowDurationMs}ms`;
}

function getFilters(vColumns){
    if(vColumns == null){
        return ''
    }

    let filters = ` r["_field"] == "t" `

    for(let i=0;i<vColumns.length;i++){
        filters = `${filters} or r["_field"] == "${vColumns[i]}"`
    }



    return filters 

}


/**
 * 构建 Flux 查询，使用动态运算表达式
 */
function buildFluxQueryUsingWindow(bucket, tableName, vColumns, symbol,funInfo, startTime, endTime, windowDuration) {
    // 生成动态运算表达式
    const computationExpr = buildComputationExpression(vColumns, symbol,funInfo);

    let filters = getFilters(vColumns)


    if (symbol === 'min' || symbol === 'max') {
        const opFunc = symbol === 'min' ? 'math.mMin' : 'math.mMax';
        const identity = symbol === 'min' ? '100000000.0' : '-100000000.0';
        const yieldPrefix = symbol === 'min' ? 'v_min' : 'v_max';

  
        // 构造字段过滤表达式
        const fieldFilter = vColumns.map(col => `r._field == "${col}"`).join(' or ');

        const reduceBase = `
import "math"

base = from(bucket: "${tableName}")
  |> range(start: ${startTime}, stop: ${endTime})
  |> filter(fn: (r) => ${fieldFilter})
  |> group(columns: ["_time"])
  |> reduce(
        fn: (r, accumulator) => ({
            computed: ${opFunc}(x: r._value, y: accumulator.computed)
        }),
        identity: {computed: ${identity}}
    )
        |> group()
        `;

        const v_min = `
        base
        |> aggregateWindow(every: ${windowDuration}, fn: min, createEmpty: false, column: "computed")
        |> yield(name: "v_min")
        `;

        const v_max = `
        base
        |> aggregateWindow(every: ${windowDuration}, fn: max, createEmpty: false, column: "computed")
        |> yield(name: "v_max")
        `;

        const t_first = `
        base
        |> aggregateWindow(every: ${windowDuration}, fn: first, createEmpty: false, column: "computed")
        |> yield(name: "t_first")
        `;

        const t_last = `
        base
        |> aggregateWindow(every: ${windowDuration}, fn: last, createEmpty: false, column: "computed")
        |> yield(name: "t_last")
        `;

        flux = `
${reduceBase}

${v_min}

${v_max}

${t_first}

${t_last}
        `;


    }
    else{

    // 构建临时表
    const pivoted = `
    import "math"

    pivoted = from(bucket: "${tableName}")
      |> range(start: ${startTime}, stop: ${endTime})
      |> filter(fn: (r) => ${filters} )
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> map(fn: (r) => ({ r with computed: ${computationExpr} }))
    `;

    // 基于临时表进行各类聚合查询
    const v_min = `
        pivoted
        |> aggregateWindow(every: ${windowDuration}, fn: min, createEmpty: false, column: "computed")
        |> yield(name: "v_min")
        `;

    const v_max = `
        pivoted
        |> aggregateWindow(every: ${windowDuration}, fn: max, createEmpty: false, column: "computed")
        |> yield(name: "v_max")
        `;

    const t_first = `
        pivoted
        |> aggregateWindow(every: ${windowDuration}, fn: first, createEmpty: false, column: "computed")
        |> yield(name: "t_first")
        `;

    const t_last = `
        pivoted
        |> aggregateWindow(every: ${windowDuration}, fn: last, createEmpty: false, column: "computed")
        |> yield(name: "t_last")
        `;

    // 将所有子查询组合成一个 Flux 查询
    flux = `
    ${pivoted}

    ${v_min}

    ${v_max}

    ${t_first}

    ${t_last}

    `;

    // flux = `
    //     ${pivoted}
    //     pivoted
    // `
        
}

    return flux.trim();
}

/**
 * 构建计算表达式，支持任意数量的 vColumns
 */
function buildComputationExpression(vColumns, symbol,funInfo) {

    let weights=funInfo.weights

    let expression = '';
    switch (symbol) {
        case '+':
        case '-':
        case '*':
        case '/':
            // 生成类似 r.v1 + r.v2 + ... 的表达式
            expression = vColumns.map(col => `r.${col}`).join(` ${symbol} `);
            break;
        case 'mean':
            // 计算平均值
            expression = `(${vColumns.map(col => `float(v: r.${col})`).join(' + ')}) / float(v:${vColumns.length})`;
            break;
        case 'variance':
            if (vColumns.length === 0) {
                throw new Error(`Symbol 'variance' 需要至少一个参数`);
            }
            // 计算方差
            const meanExpression = `(${vColumns.map(col => `float(v: r.${col})`).join(' + ')}) / float(v:${vColumns.length})`;
            expression = `(${vColumns.map(col => `(float(v: r.${col}) - (${meanExpression}))^2.0`).join(' + ')}) / float(v:${vColumns.length})`;
            break;
        case 'boxcox_0':
            if (vColumns.length !== 1) {
                throw new Error(`Symbol 'boxcox_0' 需要一个参数`);
            }
            expression = `math.log(x: float(v: r.${vColumns[0]}))`;
            break;
        case 'boxcox_1':
            if (vColumns.length !== 1) {
                throw new Error(`Symbol 'boxcox_1' 需要一个参数`);
            }
            expression = `r.${vColumns[0]} - 1.0`;
            break;
        case 'boxcox_1_2':
            if (vColumns.length !== 1) {
                throw new Error(`Symbol 'boxcox_1_2' 需要一个参数`);
            }
            expression = `(math.sqrt(x: float(v: r.${vColumns[0]})) - 1.0) * 2.0`;
            break;
        case 'boxcox_2':
            if (vColumns.length !== 1) {
                throw new Error(`Symbol 'boxcox_2' 需要一个参数`);
            }
            expression = `(math.pow(x: float(v: r.${vColumns[0]}), y: 2.0) - 1.0) / 2.0`;
            break;
        case 'func1':
            if (vColumns.length !== 1) {
                throw new Error(`Symbol 'func1' 需要一个参数`);
            }
            expression = `0.001 * math.pow(x: r.${vColumns[0]}, y: 3.0) - 3.0 * r.${vColumns[0]}`;
            break;
        case 'func4':
            if (vColumns.length !== 2) {
                throw new Error(`Symbol 'func4' 需要两个参数`);
            }
            expression = `(1.0 - math.sin(x: r.${vColumns[0]})) * math.pow(x: math.log(x: math.abs(x: r.${vColumns[1]}) + 1.0), y: 2.0)`;
            break;
        case 'weightsum':
            if (weights.length < vColumns.length) {
                throw new Error(`'weighted_sum' 的 weights 数组长度不足，需要至少 ${vColumns.length} 个权重`);
            }
            const slicedWeights = weights.slice(0, vColumns.length);
            expression = vColumns
                .map((col, i) => `(float(v: ${slicedWeights[i]})) * float(v: r.${col})`)
                .join(' + ');
            break;
        case 'L2':
            if (vColumns.length === 0) {
                throw new Error(`'l2' 需要至少一个 vColumns`);
            }
            expression = `math.sqrt(x: ${vColumns
                .map(col => `math.pow(x: float(v: r.${col}), y: 2.0)`)
                .join(' + ')})`;
            break;
        case 'min':
            if (vColumns.length === 0) {
                throw new Error(`'min' 需要至少一个字段`);
            }
            expression = `float(v: r.${vColumns[vColumns.length - 1]})`;
            for (let i = vColumns.length - 2; i >= 0; i--) {
                const current = `float(v: r.${vColumns[i]})`;
                expression = `if ${current} < ${expression} then ${current} else ${expression}`;
            }
            break;
        
        case 'max':
            if (vColumns.length === 0) {
                throw new Error(`'max' 需要至少一个字段`);
            }
            expression = `float(v: r.${vColumns[vColumns.length - 1]})`;
            for (let i = vColumns.length - 2; i >= 0; i--) {
                const current = `float(v: r.${vColumns[i]})`;
                expression = `if ${current} > ${expression} then ${current} else ${expression}`;
            }
            break;      
        default:
            throw new Error(`Unsupported symbol: ${symbol}`);
    }

    return expression;
}


function groupResultsByYield(rows) {
    const grouped = {
        v_min: [],
        v_max: [],
        t_first: [],
        t_last: []
    };

    rows.forEach(row => {
        if (row.result === 'v_min') {
            grouped.v_min.push(row);
        } else if (row.result === 'v_max') {
            grouped.v_max.push(row);
        } else if (row.result === 't_first') {
            grouped.t_first.push(row);
        } else if (row.result === 't_last') {
            grouped.t_last.push(row);
        }
    });

    return grouped;
}


async function Case5_test(table_name,columns,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type,screen_m4){

    console.log('Case5_test')
   
    //console.log(table_name1,table_name_others,symbol,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type)
     //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
     symbol = symbol.split(';')
     if (symbol.length > 1) {
         params = symbol[1].split(',')
     } else {
         params = []
     }

     let funInfo = new FunInfo(symbol[0],params)
     symbol = funInfo.funName

     let tableName = mergeTables(table_name,columns,funInfo, 'tv')


     let column1 = columns[0];
     let column_others = columns.slice(1);
  
 



    const influxUrl = dbConfig['influxUrl'];
    const token = dbConfig['token'];
    const org = dbConfig['org'];
    const bucket = dbConfig['bucket'];

    const { InfluxDB } = require('@influxdata/influxdb-client');
    //创建 InfluxDB 客户端实例
    const influxDB = new InfluxDB({
        url: influxUrl,
        token: token,
        timeout: 24*60*60*1000  // 增加超时时间，例如60秒
    })
    // 创建查询客户端
    const queryApi = influxDB.getQueryApi(org);


    // for test!!!!!!!!
    //tableName = 'little'

    if(endTime < 0){
        let rows = await getTime(queryApi, bucket, tableName);

        let { starttime, endtime } = timeSE(rows);

        startTime = starttime;
        endTime = endtime;
        console.log('Start Time:', startTime, 'End Time:', endTime);
     }

    try {
        // 计算窗口持续时间
        const windowDuration = calculateWindowDuration(startTime, endTime, width);
        console.log(`Calculated window duration: ${windowDuration}`);

        // 构建 Flux 查询
        const fluxQuery = buildFluxQueryUsingWindow(bucket, tableName, columns, symbol, startTime, endTime, windowDuration);
        console.log(`Constructed Flux Query:\n${fluxQuery}`);

        //console.time('query')
        // 执行查询
        timestart('SQL.query.time');
        const tables = await queryApi.collectRows(fluxQuery);
        timeend('SQL.query.time');
        //console.timeEnd('query')

        //console.log(`Number of Records Returned: ${tables.length}`);
        //console.log(tables)
        // 分组结果
        const groupedResults = groupResultsByYield(tables);
    

        let M4_array = []
        for (let i = 0; i < tables.length / 4; i++) {
            let pair = {
                start_time:groupedResults.t_first[i].t, 
                st_v:      groupedResults.t_first[i].computed,
                end_time:  groupedResults.t_last[i].t,
                et_v:      groupedResults.t_last[i].computed,
                min:       groupedResults.v_min[i].computed,
                max:       groupedResults.v_max[i].computed
            }

            M4_array.push(pair);

        }


        let M4_arrays = []
        let min_values = [];
        let max_values = [];
        let { min_value, max_value } = getMinMaxOfM4(M4_array);
    
        //let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);
    
        M4_arrays.push(M4_array);
        min_values.push(min_value);
        max_values.push(max_value);
    
    
        screen_m4.M4_array = M4_array
        screen_m4.dataReductionRatio = 1 - width*4 / (endTime-startTime+1)
    
        return {
            M4_array: M4_arrays,
            min_value: min_values,
            max_value: max_values
        }


    } catch (error) {
        console.error('Error:', error);
    }




 }






 async function readDataFromInflux(table_name, start_time, end_time) {
 
     /**
      * 查询数据函数
      * @param {string} token InfluxDB token
      * @param {string} org InfluxDB 组织
      * @param {string} url InfluxDB 地址
      * @param {string} measurement Measurement 名称
      * @param {number} startTime 起始时间（Unix 时间戳，毫秒）
      * @param {number} endTime 结束时间（Unix 时间戳，毫秒）
      */
 
     const token = 'QSGJ0zR5x5SKmU7C54bUL6Wwjs2YjQt7HcnH3_O8b57CPhoz0zcv8GjpO2eV9JhL_vqru05EWp45vNB9ZjIqwA=='; // 替换为你的 InfluxDB Token
     const org = 'cxsj'; // 替换为你的组织
     //const url = 'http://localhost:8086'; // 替换为你的 InfluxDB 地址
     const url = 'http://10.24.111.157:8086';
 

     
     return queryData(token, org, url, table_name, start_time, end_time)
 
     
 
 }
 
 async function queryData(token, org, url, measurement, startTime, endTime) {
     const axios = require('axios');
     const database = 'cxsj';
     const influxQLUrl = `${url}/query?db=${database}`;
 
     // 将 startTime 和 endTime 转换为 InfluxQL 支持的格式（RFC3339）
     const startISO = new Date(startTime).toISOString();
     const endISO = new Date(endTime).toISOString();
     const query = `
     SELECT t, value
     FROM "${measurement}"
     WHERE t >= ${startTime} AND t <= ${endTime}
     ORDER BY time ASC
   `;
     // const query = `
     // SELECT count(t)
     // FROM "${measurement}"
     // `;
     let result = [];
     try {
         const response = await axios.post(
         influxQLUrl,
         `q=${query}`,
         {
             headers: {
             'Authorization': `Token ${token}`,
             'Content-Type': 'application/x-www-form-urlencoded',
             },
         }
         );
 
         console.log('查询结果:', response.data);
         if (response.data && response.data.results && response.data.results[0].series) {
         //     for (let i = 0; i < response.data.result[0].series.length; i++){
         //         let 
         //     }
         response.data.results[0].series.forEach((series) => {
             // console.log(`length: ${series.values.length}`)
             for (let i = 0; i < series.values.length; i++){
                 let pair = {t: series.values[i][1], v:series.values[i][2]}
                 // console.log(pair)
                 result.push(pair)
                 // console.log('数据:', series.values);
             } 
         });
         } else {
         console.log('没有数据返回');
         }
     } catch (error) {
         console.error('查询失败:', error);
     }
     console.log(result);
     return result;
 }
 
 






//  async function Case4(table_name1,table_name_others,symble,params,width,height,mode,parallel,errorBound,startTime,endTime, interact_type){
//     console.log('Case3')
     
//     let screenStart = startTime
//     let screenEnd = endTime

    
    
//     //对单点函数，extremes是极值点；对均值，extremes是区间长度；对加权均值，extremes是加权数组， 如[1,-1,3,1,-1]
//      symble = symble.split(';')
//      if (symble.length > 1) {
//          params = symble[1].split(',')
//      } else {
//          params = []
//      }

//      let funInfo = new FunInfo(symble[0],params)


//     let tables = mergeTables(table_name1,table_name_others,funInfo, 'om3')
//     let results = []
//     let M4_arrays = []
//     // tables.push(table_name1)
//     // for(let i=0;i<table_name_others.length;i++){
//     //     if(table_name_others[i] == '' || table_name_others[i] == null){
//     //         continue
//     //     }

//     //     tables.push(table_name_others[i])
//     // }
    

//     //构建树
//     let segmentTrees = []
//     for(let i=0;i<tables.length;i++){
//         //console.time('buildtree-total'); // 开始计时
//         segmentTrees.push(await buildtree(tables[i], width, screenStart,screenEnd))
//         //console.timeEnd('buildtree-total'); // 结束计时并打印结果
   

//         let realDataRowNum = getRealDataRowNum(segmentTrees[0], segmentTrees[0])


//         if(isNaN(screenStart) || screenStart < 0){
//             screenStart = 0
//         }
//         if(isNaN(screenEnd) || screenEnd<0 || screenEnd > realDataRowNum-1){
//             screenEnd = realDataRowNum-1
//         }

//         //console.log(screenStart, screenEnd)



//         //构建M4数组，width个M4元素。
//         let M4_array = computeM4TimeSE(width, [screenStart, screenEnd])



//         await fenlie(M4_array, screenStart,screenEnd, [segmentTrees[i]], funInfo, []);
//         sympleInitM4(segmentTrees,M4_array,funInfo, mode, parallel, null)

//         M4_arrays.push(M4_array)
//     }






//     let M4_array=computeM4TimeSE(width, [screenStart, screenEnd])
//     let min_values = [];
//     let max_values = [];
//     let computeData = []

//     let min_value = Infinity;
//     let max_value = -Infinity;
//     for(let i=0;i<M4_array.length;i++){
//         let m4 = M4_array[i]

//         computeData = []
//         for(let j=0;j<M4_arrays.length;j++){
//             computeData.push(M4_arrays[j].st_v)
//         }
//         let st_v = compute(computeData, funInfo, interact_type)

//         computeData = []
//         for(let j=0;j<M4_arrays.length;j++){
//             computeData.push(M4_arrays[j].et_v)
//         }
//         let et_v = compute(computeData, funInfo, interact_type)


        
//         computeData = []
//         for(let j=0;j<M4_arrays.length;j++){

//             let node = new SegmentTreeNode()
//             node.min = M4_arrays[j].min
//             node.max = M4_arrays[j].max
//             computeData.push(node)
//         }
  
//         let {tmpmin,tmpmax}=unifiedCalulate(segmentTrees, computeData, funInfo, mode, false)

//         m4.st_v=st_v
//         m4.et_v=et_v
//         m4.min=tmpmin
//         m4.max=tmpmax

//         min_value = Math.min(min_value,st_v,et_v,tmpmin,tmpmax)
//         max_value = Math.max(max_value,st_v,et_v,tmpmin,tmpmax)

//     }

//     //let {M4_array: M4_array, min_value: min_value, max_value: max_value} = generateM4(result, width, startTime, endTime);

//     M4_arrays.push(M4_array);
//     min_values.push(min_value);
//     max_values.push(max_value);




//     return {
//         M4_array: M4_arrays,
//         min_value: min_values,
//         max_value: max_values
//     }


//  }



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


    return res
}

async function aggregate(table1, columns, width, screen_m4) {
    console.log('aggregate');
    let t3 = [];

    initDataInfo(screen_m4)


    let start = screen_m4.globalIntervalStart
    let end = screen_m4.globalIntervalEnd
    
    let intervalRange = screen_m4.intervalLength

    for(let c of columns){
        let column = `v${c}`

        let M4_array = computeM4TimeSE(width, [screen_m4.screenStart, screen_m4.screenEnd])
        await calM4(start, intervalRange, column, table1, end, M4_array, screen_m4);
        screen_m4.M4_arrays.push(M4_array)
    }


    return
    // const length = result1.rows.length;

    // console.log(`Fetched ${length} rows from ${table1}`);
    // console.log(`Chunk size (IntervalRange parameter): ${intervalRange}`);
    // result1.rows.forEach(e => {
    //     e.v = parseFloat(e.v);
    // })
    // // result1.rows.forEach(e =>{
    // //     console.log(e)
    // // })

    // if (intervalRange <= 0) {
    //     console.error("Error: 'intervalRange' parameter should be greater than 0.");
    //     return { data: t3 };
    // }
    // let sum = 0
    // let avgV = 0
    
    // for (let i = 0; i < length; i++) {
    //     let chunkIndex = Math.floor(i / intervalRange); // 计算当前数据点属于哪个chunk
    //     let chunkStartIndex = chunkIndex * intervalRange; // 当前chunk的起始索引
    //     let chunkEndIndex = Math.min(chunkStartIndex + intervalRange -1, length-1); // 当前chunk的结束索引
        
    //     //console.log('start:',chunkStartIndex, '  end:',chunkEndIndex)
    //     if(i == chunkStartIndex){
    //         sum = 0
    //         for(let j=chunkStartIndex;j<= chunkEndIndex;j++){
    //             sum += parseFloat(result1.rows[j].v)
    //         }
    //         avgV = sum/(chunkEndIndex-chunkStartIndex+1)
    //     }
    //     // // 当前chunk的所有数据
    //     // let chunk = result1.rows.slice(chunkStartIndex, chunkEndIndex);

    //     // // 计算当前chunk的平均v值
    //     // let avgV = chunk.reduce((sum, row) => sum + row.v, 0) / chunk.length;

    //     // 将每个数据点的t和计算好的avgV添加到结果数组中
        
    //     t3.push({ t: result1.rows[i].t, v: avgV });

    //     //console.log('i:',i, '  v:', avgV)
    // }
    // // console.log(t3);

    // let num = t3.length

    // let res = computeM4TimeSE(width, [0, num - 1])
    // let globalStartTime = t3[0].t;
    // let globalEndTime = t3[num - 1].t;
    // res.forEach(e => {
    //     let min = Infinity;
    //     let max = -Infinity;
    //     let { s: frontTime, e: lastTime } = getFrontMidLast(globalStartTime, globalEndTime, e.start_time, e.end_time, intervalRange);
    //     //console.log(frontTime);
    //     if (frontTime == null) {
    //         frontTime = e.start_time + intervalRange-1;
    //     }
    //     if (lastTime == null) {
    //         lastTime = e.end_time - intervalRange+1;
    //     }


    //     for (let i = frontTime ; i <= lastTime ; i++) {
    //         // console.log(t3[i].v)
    //         if (t3[i].v < min) {
    //             min = t3[i].v
    //         }

    //         if (t3[i].v > max) {
    //             max = t3[i].v
    //         }
    //     }



    //     e.min = min
    //     e.max = max
    //     e.st_v = t3[e.start_time].v
    //     e.et_v = t3[e.end_time].v

    //     if(frontTime + 1 > lastTime - 1){
    //         e.min = Math.min(e.st_v,e.et_v)
    //         e.max = Math.max(e.st_v,e.et_v)
    //     }
    // })


    //return res
}




async function calM4(start, intervalRange, column, table1, end, M4_array, screen_m4) {
    let sql = `SELECT 
    FLOOR((t-(${start})) / ${intervalRange}) AS group_id,  -- 计算组号，每60个一组
    MIN(t) AS start_time,                 
    MAX(t) AS end_time,  
    AVG(${column}) AS average_value,    -- 每组的均值
    -- AVG(v7-v9) AS average_value,    -- 每组的均值
    SUM(${column}) AS sum_value,         -- 每组的总和
    COUNT(*)
    FROM 
        ${table1}
        where t between ${start} and ${end}
    GROUP BY 
        group_id
    ORDER BY 
        group_id;`;

    console.log(sql);

    let result1 = await pool.query(sql);

    let rows = result1.rows;

    //console.log(rows)
    let length = rows.length;
    let m = 0, i = 0;

    while (m < M4_array.length && i < rows.length) {
        //console.log(m,i)
        let m4 = M4_array[m];
        let interval = new Interval(rows[i].start_time, rows[i].end_time, 0, screen_m4.dataCont - 1);
        let type = relationship(interval, m4);
        let value = 0;

        if (m == 196) {
            debug = true;
        }

        if (screen_m4.func.funName == 'sum') {
            value = parseFloat(rows[i].sum_value);
        } else if (screen_m4.func.funName == 'ave') {
            value = parseFloat(rows[i].average_value);
        }

        if (type == 1) {
            i++;
            continue;
        }

        if (type == 2) {
            let r = value;
            m4.st_v = r;
            if (m4.max < r) {
                m4.max = r;
            }
            if (m4.min > r) {
                m4.min = r;
            }

            i++;
            continue;
        }
        if (type == 3) {
            let r = value;
            if (m4.max < r) {
                m4.max = r;
            }
            if (m4.min > r) {
                m4.min = r;
            }

            i++;
            continue;
        }

        if (type == 4) {
            let r = value;
            m4.et_v = r;
            if (m4.max < r) {
                m4.max = r;
            }
            if (m4.min > r) {
                m4.min = r;
            }

            m++;
            continue;
        }

        if (type == 5) {
            let r = value;
            m4.st_v = r;
            m4.et_v = r;
            if (m4.max < r) {
                m4.max = r;
            }
            if (m4.min > r) {
                m4.min = r;
            }

            m++;
            continue;
        }

        if (type == 9) {
            m++;
            continue;
        }


    }
}

// async function t(){

//     const numbers = [5, 2, 9, 1, 5, 6];
//     const min = Math.min(...numbers);
//     console.log(min); // 输出：1

//     for (let i = 0; i < 100; i++) {

//         await testTime(1)
//     }

//     for(let key in stats.callCounts){
//         timetotal(key)
//     }

// }


// 读取文件并合并 SQL
async function mergeSQLQueries(filePath) {
    try {
      // 1. 读取文件内容
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // 2. 匹配所有 `IN` 条件的值
      const inValues = [];
      const regex = /in\s*\(([^)]+)\)/gi; // 匹配 `IN (...)`
      let match;
      while ((match = regex.exec(fileContent)) !== null) {
        const values = match[1].split(',').map(val => val.trim());
        inValues.push(...values);
      }
  
      // 3. 去重并排序（可选）
      const uniqueValues = Array.from(new Set(inValues));
  
      // 4. 生成合并后的 SQL
      const mergedSQL = `SELECT i, minvd, maxvd FROM nyc_bronx_green_minute_om3 WHERE i IN (${uniqueValues.join(', ')});`;
  
      //console.log('Merged SQL:', mergedSQL);
      return mergedSQL;
    } catch (error) {
      console.error('Error merging SQL queries:', error);
    }
  }
  



// 读取文件并执行 SQL
async function executeSQLFile(filePath) {
  try {
    // 1. 一次性读取文件内容
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // 2. 按行分隔，并过滤空行
    const sqlLines = fileContent.split('\n').map(line => line.trim()).filter(line => line);

    

    timestart('nomerge');

    let num = 0
    // 4. 遍历数组并执行每行 SQL
    for (const sql of sqlLines) {
      //console.log(`Executing SQL: ${sql}`);
      let r = await pool.query(sql);
      num += r.rows.length
    }

    timeend('nomerge');



    console.log('nomerge num:',num);

   
  } catch (error) {
    console.error('Error executing SQL file:', error);
  }
}





async function testTime(length) {


    // 调用函数
    await executeSQLFile('nyc_bronx_green_minute_om3.sql');



      // 调用函数
    let mergedSQL = await mergeSQLQueries('nyc_bronx_green_minute_om3.sql');



    timestart('merge');
    let r = await pool.query(mergedSQL);

    let num = r.rows.length
    console.log('merge num:',num);

    timeend('merge');

    return

    length = 100000000

    console.time('nomerge');
    let sql1 = ''
    const result1 = await pool.query(sql1);

    console.timeEnd('nomerge');



    console.time('merge');
    let sql2 = ''
    const result2 = await pool.query(sql2);


    console.timeEnd('merge');
}


class Params{
    constructor(){
        this.table;
        this.columns;
        this.width
        this.height
        this.symbol
        this.experiment
        this.startTime
        this.endTime
        this.errorBound
        this.parallel
        this.maxEndTime
    }
}


async function genPlans(){
    let datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "synthetic_8m 1,2,3,4,5", "sensordata 5,4,3,2,1,7,6", "soccerdata 5,3,1,2,4,6", "stockdata 9,5,1,2,3,4,6,7,8,10", "traffic 1,2,3,4,5", "synthetic_1m 1,2,3,4,5", "synthetic_2m 1,2,3,4,5", "synthetic_4m 1,2,3,4,5", "synthetic_16m 1,2,3,4,5", "synthetic_32m 1,2,3,4,5"]
    let functions=["func1", "boxcox_0", "+", "-", "*", "/", "func4", "mean", "variance"]
    let widths = [200, 400, 600, 800, 1000, 1200]


    for(let data of datasets){
        data = data.split(' ')
        let table = data[0]
        let initColumns = data[1].split(',').map(Number)
        let computeColumns = []
        computeColumns.push(initColumns[0])
        computeColumns.push(initColumns[1])
    

        let dataCount = await getCount(table)
        //let totalColumns = await getcolumnsbyname(table)

        //console.log(table, initColumns, computeColumns, dataCount)

        //console.log(`${table} ${plan} ${computeColumns} ${startTime} ${endTime} ${symbol} ${width}`)
        
        getPlansRandom(table, initColumns, computeColumns, dataCount)
        

    }

    pool.end()

}

async function getPlans(){
    const fs = require('fs');

    let plans = {}
    // 读取文件内容
    const content = fs.readFileSync('../data/plans.txt', 'utf8');
    
    // 将内容按行分割
    const lines = content.split('\n');
    
    // 按行处理
    lines.forEach(line => {
        //console.log(`处理行: ${line}`);
        // 在这里进行对每行的操作，例如解析或处理数据

        let items = line.split(',')
        if(items.length > 3){

            let table = items[0]
            if(table in plans){
                plans[table].push(items)
            }else{
                plans[table]=[]
                plans[table].push(items)
            }

        }

    });
    

    return plans
}


function genDatainfo(screen_m4){

    let func = screen_m4.func
    if(screen_m4.datasetname == 'nycdata'){

        // todo 后面根据数据选取的时间段进行调整。
        screen_m4.globalIntervalStartTime = 1420041600
        screen_m4.globalIntervalEndTime = 1704038399
        screen_m4.delta = 60

        if(func == null || screen_m4.func.funName==''){
            return
        }

        if(func.funName == 'ave' || func.funName == 'sum'){
            if(func.params == 'hour'){
                screen_m4.intervalLength = 60
            }else if(func.params == 'day'){
                screen_m4.intervalLength = 60 * 24
            }else if(func.params == 'week'){
                screen_m4.intervalLength = 60 * 24 * 7
            }else if(func.params == 'month'){
                screen_m4.intervalLength = 60 * 24 * 30
            }else if(func.params == 'year'){
                screen_m4.intervalLength = 60 * 24 * 365
            }
        }
    }
}



async function agg(){



    let estimates = ["d"]//["d", "b", "c", "e", "f"]
    let ablationStudy = ["s1", "s2", "s3", "s4"]

    let experiments = ["ours","case2","case3","case4","case5", "case6"]
    let datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "sensordata 5,4,3,2,1,7,6", "soccerdata 5,3,1,2,4,6", "stockdata 9,5,1,2,3,4,6,7,8,10", "traffic 1,2,3,4,5,6,7,8,9,10", "synthetic_1m 1,2,3,4,5", "synthetic_2m 1,2,3,4,5", "synthetic_4m 1,2,3,4,5", "synthetic_8m 1,2,3,4,5", "synthetic_16m 1,2,3,4,5", "synthetic_32m 1,2,3,4,5", "synthetic_64m 1,2,3,4,5", "synthetic_128m 1,2,3,4,5", "synthetic_256m 1,2,3,4,5"]
    let functions=["func1", "boxcox_0", "+", "-", "*", "/", "func4", "mean", "variance"]
    let widths = [200, 400, 600, 800, 1000, 1200]
    
    let errorbounds = [0.1, 0.05, 0.01, 0]

    let timelimits = [1]//[0.1, 0.5, 1]
    let Mlimit = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]


    //datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "synthetic_256m 1,2,3,4,5"]
    ablationStudy = ["s3"]
     // functions=["/"]

     memeryCache = 1024 * 1024*1024 // 1G
     timelimit = 1000


     isMergeTable = true
     isTreeCache = true
     isParallel = false



datasets = ["nycdata 7,9,1,2"]

experiments = ["aggregate", "ours"]
//experiments = ["ours"]
functions=["ave#day", "ave#week", "ave#month", "ave#year"]
//functions=["ave#hour"]
// for(let tl of timelimits){
//     timelimit = tl*1000
// for(m of Mlimit){
//     memeryCache= m * 1024*1024 //m MB

//for(let errorBound of errorbounds){
    //for(let experiment of experiments){
        //for(let data of datasets){
            let experiment = 'ours'
            let data = "nycdata 7,9,1,2,3,4,5,6"
            data = data.split(' ')
            let table_name = data[0]
            let dataCount = await getCount(table_name)
            let columns = data[1].split(',')

            //for (let symbol of functions) {
                let repeat = 0
                //for (let width of widths) {
                //for(let i=0;i<widths.length;i++){
                    let symbol
                    let width = 600 // widths[i]
                    let startTime = 0
                    let endTime = -1
                    let mode = 'single'
                    let height = 600
                    let interact_type = 'null'
                    let parallel = 1
                    let errorBound = 0.05
                    let screen_m4 = null

                    


                    experiment = 'ours'
                    symbol = ';ave#week'
                    startTime = 0
                    endTime = -1
                    data = "nycdata 7,9,1,2,3,4,5,6"
                    data = data.split(' ')
                    table_name = data[0]
                    dataCount = await getCount(table_name)
                    columns = data[1].split(',')

                    await Experiments(experiment, startTime, endTime, table_name,dataCount, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4);


                    experiment = 'ours'
                    symbol = '-;ave#week'
                    startTime = 0
                    endTime = -1
                    data = "nycdata 1,4"
                    data = data.split(' ')
                    table_name = data[0]
                    dataCount = await getCount(table_name)
                    columns = data[1].split(',')

                    await Experiments(experiment, startTime, endTime, table_name,dataCount, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4);


                    experiment = 'ours'
                    symbol = '-'
                    startTime = 123413
                    endTime = 1234123
                    data = "nycdata 1,4"
                    data = data.split(' ')
                    table_name = data[0]
                    dataCount = await getCount(table_name)
                    columns = data[1].split(',')

                    await Experiments(experiment, startTime, endTime, table_name,dataCount, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4);



                    

                    //pool.end();return 
                //}

          //  }
        //}
   

}


async function test(){



    let estimates = ["d"]//["d", "b", "c", "e", "f"]
    let ablationStudy = ["s1", "s2", "s3", "s4"]

    let experiments = ["ours","case2","case3","case4","case5", "case6"]
    let datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "sensordata 5,4,3,2,1,7,6", "soccerdata 5,3,1,2,4,6", "stockdata 9,5,1,2,3,4,6,7,8,10", "traffic 1,2,3,4,5,6,7,8,9,10", "synthetic_1m 1,2,3,4,5", "synthetic_2m 1,2,3,4,5", "synthetic_4m 1,2,3,4,5", "synthetic_8m 1,2,3,4,5", "synthetic_16m 1,2,3,4,5", "synthetic_32m 1,2,3,4,5", "synthetic_64m 1,2,3,4,5", "synthetic_128m 1,2,3,4,5", "synthetic_256m 1,2,3,4,5"]
    let functions=["func1", "boxcox_0", "+", "-", "*", "/", "func4", "mean", "variance"]
    let widths = [200, 400, 600, 800, 1000, 1200]
    
    let errorbounds = [0.1, 0.05, 0.01, 0]

    let timelimits = [1]//[0.1, 0.5, 1]
    let Mlimit = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]


    //datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "synthetic_256m 1,2,3,4,5"]
    ablationStudy = ["s3"]
     // functions=["/"]

     memeryCache = 1024 * 1024*1024 // 1G
     timelimit = 1000


     isMergeTable = true
     isTreeCache = true
     isParallel = false



datasets = ["nycdata 7,9,1,2"]

experiments = ["ours"]
//experiments = ["ours"]
functions=["boxcox_0"]
//functions=["ave#hour"]
// for(let tl of timelimits){
//     timelimit = tl*1000
// for(m of Mlimit){
//     memeryCache= m * 1024*1024 //m MB

//for(let errorBound of errorbounds){
    //for(let experiment of experiments){
        //for(let data of datasets){
            let experiment = 'ours'
            let data = "nycdata 7,9,1,2,3,4,5,6"
            data = data.split(' ')
            let table_name = data[0]
            let dataCount = await getCount(table_name)
            let columns = data[1].split(',')

            //for (let symbol of functions) {
                let repeat = 0
                //for (let width of widths) {
                //for(let i=0;i<widths.length;i++){
                    let symbol
                    let width = 600 // widths[i]
                    let startTime = 0
                    let endTime = -1
                    let mode = 'single'
                    let height = 600
                    let interact_type = 'null'
                    let parallel = 1
                    let errorBound = 0.05
                    let screen_m4 = null


                    experiment = 'ours'
                    symbol = '-'
                    startTime = 0
                    endTime = 4000000
                    data = "nycdata 1,4"
                    data = data.split(' ')
                    table_name = data[0]
                    dataCount = await getCount(table_name)
                    columns = data[1].split(',')

                    await Experiments(experiment, startTime, endTime, table_name,dataCount, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4);



                    

                    //pool.end();return 
                //}

          //  }
        //}
   



}




async function static(){



    let estimates = ["d"]//["d", "b", "c", "e", "f"]
    let ablationStudy = ["s1", "s2", "s3", "s4"]

    let experiments = ["ours","PG-F","OM3","PG-M4","IFX-F", "IFX-M4"]
    let datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "sensordata 5,4,3,2,1,7,6", "soccerdata 5,3,1,2,4,6", "stockdata 9,5,1,2,3,4,6,7,8,10", "traffic 1,2,3,4,5,6,7,8,9,10", "synthetic_1m 1,2,3,4,5", "synthetic_2m 1,2,3,4,5", "synthetic_4m 1,2,3,4,5", "synthetic_8m 1,2,3,4,5", "synthetic_16m 1,2,3,4,5", "synthetic_32m 1,2,3,4,5", "synthetic_64m 1,2,3,4,5", "synthetic_128m 1,2,3,4,5"]
    let functions=["func1", "boxcox_0", "+", "-", "*", "/", "func4", "mean", "variance", "max", "L2", "weightsum"]
    let widths = [200, 400, 600, 800, 1000, 1200]
    
    let errorbounds = [0.1, 0.05, 0.01, 0]

    let timelimits = [1]//[0.1, 0.5, 1]
    let Mlimit = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]


    ablationStudy = ["s3"]
     // functions=["/"]

     memeryCache = 1024 * 1024*1024 // 1G
     timelimit = 1000


     isMergeTable = true
     isTreeCache = false
     isParallel = false


     // for test
     //datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "traffic 1,2,3,4,5,6,7,8,9,10"]
     datasets = ["sensordata 5,4,3,2,1,7,6", "soccerdata 5,3,1,2,4,6", "stockdata 9,5,1,2,3,4,6,7,8,10", "traffic 1,2,3,4,5,6,7,8,9,10", "synthetic_1m 1,2,3,4,5", "synthetic_2m 1,2,3,4,5", "synthetic_4m 1,2,3,4,5", "synthetic_8m 1,2,3,4,5", "synthetic_16m 1,2,3,4,5", "synthetic_32m 1,2,3,4,5", "synthetic_64m 1,2,3,4,5", "synthetic_128m 1,2,3,4,5"]
     experiments = ["IFX-F"]
     functions=["weightsum", "L2"]



//experiments = ["ours"]

// for(let tl of timelimits){
//     timelimit = tl*1000
// for(m of Mlimit){
//     memeryCache= m * 1024*1024 //m MB

for(let experiment of experiments){
    for(let errorBound of errorbounds){
        for(let data of datasets){
            data = data.split(' ')
            let table_name = data[0]
            let dataCount = await getCount(table_name)
            for (let symbol of functions) {
                let repeat = 0
                //for (let width of widths) {
                for(let i=0;i<widths.length;i++){
                    let width = widths[i]

                
                    let mode = 'single'
                    let height = 600
                    let startTime = 0
                    let endTime = -1
                    let interact_type = 'null'
                    let parallel = 1
                    //let errorBound = 0.05
                    let screen_m4
                    //let maxEndTime = await getCount(table_name) - 1


                    //console.log(experiment, table_name)


                    let datasetname = table_name
                    datasetname = datasetname.replace(/_/g, '');  // 使用正则表达式去掉所有的下划线



                    let symbolName = getSymbolName(symbol);
                    //console.log(i, plan, startTime, endTime, symbol, width)

                    screen_m4 = new SCREEN_M4(experiment, datasetname, 0, symbolName, width, height, errorBound)
                    screen_m4.estimateType = 'estimateType'
                    screen_m4.sx = 'sx'
                    screen_m4.screenStart = startTime
                    screen_m4.screenEnd = endTime



                    errorBoundSatisfyCount = 0
                    if (!isTreeCache) {
                        treeCache = {}
                    }


                
                    let columns = data[1].split(',')
                    await Experiments(experiment, startTime, endTime, table_name,dataCount, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4);
 
                }

            }

        }    

        if(experiment != 'ours'){
            break
        }
    }

}

    //console.log(ablationStudyDict)
 
}


async function static(){



    let estimates = ["d"]//["d", "b", "c", "e", "f"]
    let ablationStudy = ["s1", "s2", "s3", "s4"]

    let experiments = ["ours","PG-F","OM3","PG-M4","IFX-F", "IFX-M4"]
    let datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "sensordata 5,4,3,2,1,7,6", "soccerdata 5,3,1,2,4,6", "stockdata 9,5,1,2,3,4,6,7,8,10", "traffic 1,2,3,4,5,6,7,8,9,10", "synthetic_1m 1,2,3,4,5", "synthetic_2m 1,2,3,4,5", "synthetic_4m 1,2,3,4,5", "synthetic_8m 1,2,3,4,5", "synthetic_16m 1,2,3,4,5", "synthetic_32m 1,2,3,4,5", "synthetic_64m 1,2,3,4,5", "synthetic_128m 1,2,3,4,5"]
    let functions=["func1", "boxcox_0", "+", "-", "*", "/", "func4", "mean", "variance", "max", "L2", "weightsum"]
    let widths = [200, 400, 600, 800, 1000, 1200]
    
    let errorbounds = [0.1, 0.05, 0.01, 0]

    let timelimits = [1]//[0.1, 0.5, 1]
    let Mlimit = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]


    ablationStudy = ["s3"]
     // functions=["/"]

     memeryCache = 1024 * 1024*1024 // 1G
     timelimit = 1000


     isMergeTable = true
     isTreeCache = false
     isParallel = false


     // for test
     //datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "traffic 1,2,3,4,5,6,7,8,9,10"]
     datasets = ["sensordata 5,4,3,2,1,7,6", "soccerdata 5,3,1,2,4,6", "stockdata 9,5,1,2,3,4,6,7,8,10", "traffic 1,2,3,4,5,6,7,8,9,10", "synthetic_1m 1,2,3,4,5", "synthetic_2m 1,2,3,4,5", "synthetic_4m 1,2,3,4,5", "synthetic_8m 1,2,3,4,5", "synthetic_16m 1,2,3,4,5", "synthetic_32m 1,2,3,4,5", "synthetic_64m 1,2,3,4,5", "synthetic_128m 1,2,3,4,5"]
     experiments = ["IFX-F"]
     functions=["weightsum", "L2"]



//experiments = ["ours"]

// for(let tl of timelimits){
//     timelimit = tl*1000
// for(m of Mlimit){
//     memeryCache= m * 1024*1024 //m MB

for(let experiment of experiments){
    for(let errorBound of errorbounds){
        for(let data of datasets){
            data = data.split(' ')
            let table_name = data[0]
            let dataCount = await getCount(table_name)
            for (let symbol of functions) {
                let repeat = 0
                //for (let width of widths) {
                for(let i=0;i<widths.length;i++){
                    let width = widths[i]

                
                    let mode = 'single'
                    let height = 600
                    let startTime = 0
                    let endTime = -1
                    let interact_type = 'null'
                    let parallel = 1
                    //let errorBound = 0.05
                    let screen_m4
                    //let maxEndTime = await getCount(table_name) - 1


                    //console.log(experiment, table_name)


                    let datasetname = table_name
                    datasetname = datasetname.replace(/_/g, '');  // 使用正则表达式去掉所有的下划线



                    let symbolName = getSymbolName(symbol);
                    //console.log(i, plan, startTime, endTime, symbol, width)

                    screen_m4 = new SCREEN_M4(experiment, datasetname, 0, symbolName, width, height, errorBound)
                    screen_m4.estimateType = 'estimateType'
                    screen_m4.sx = 'sx'
                    screen_m4.screenStart = startTime
                    screen_m4.screenEnd = endTime



                    errorBoundSatisfyCount = 0
                    if (!isTreeCache) {
                        treeCache = {}
                    }


                
                    let columns = data[1].split(',')
                    await Experiments(experiment, startTime, endTime, table_name,dataCount, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4);
 
                }

            }

        }    

        if(experiment != 'ours'){
            break
        }
    }

}

    //console.log(ablationStudyDict)
 
}




async function interactions(){



    let estimates = ["d"]//["d", "b", "c", "e", "f"]
    let ablationStudy = ["s1", "s2", "s3", "s4"]

    let experiments = ["ours","case2","case3","case4","case5", "case6"]
    let datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "synthetic_8m 1,2,3,4,5", "sensordata 5,4,3,2,1,7,6", "soccerdata 5,3,1,2,4,6", "stockdata 9,5,1,2,3,4,6,7,8,10", "traffic 1,2,3,4,5,6,7,8,9,10", "synthetic_1m 1,2,3,4,5", "synthetic_2m 1,2,3,4,5", "synthetic_4m 1,2,3,4,5", "synthetic_16m 1,2,3,4,5", "synthetic_32m 1,2,3,4,5", "synthetic_64m 1,2,3,4,5", "synthetic_128m 1,2,3,4,5", "synthetic_256m 1,2,3,4,5"]
    let functions=["func1", "boxcox_0", "+", "-", "*", "/", "func4", "mean", "variance"]
    let widths = [200, 400, 600, 800, 1000, 1200]
    let errorbounds = [0.1, 0.05, 0.01, 0]
    
    let timelimits = [1]
    let Mlimit = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]



    //datasets = ["synthetic_256m 1,2,3,4,5"]
    ablationStudy = ["s3"]
     // functions=["/"]

     memeryCache = 10240 * 1024*1024 // 10G
     timelimit = 1000


     isMergeTable = true
     isTreeCache = true
     
     isParallel = false
     isMemLimit = false

    datasets = ["nycdata 7,9,1,2,3,4,5,6,8,10,11", "synthetic_32m 1,2,3,4,5"]
    experiments = ["ours","case2","case3"]
//experiments = ["ours"]
//functions=["mean", "variance"]
Mlimit = [128, 256, 512, 1024, 2048]
// for(let tl of timelimits){
//     timelimit = tl*1000
//for(let m of Mlimit){
//    memeryCache= m * 1024*1024 //m MB
//for(let errorBound of errorbounds){

let allplans = await getPlans()
//console.log(plans)
//return 

    for (let data of datasets) {
        data = data.split(' ')
        let table_name = data[0]
        let dataCount = await getCount(table_name)

        let plans = allplans[table_name]
        if(plans == null){
            continue
        }
        //console.log(table_name,plans.length);continue

        for (let experiment of experiments) {

            for(let plan of plans){
                console.log(plan)
                let interact_type = plan[1]
                let columns = plan[2].split('I').map(Number)

                let startTime = parseInt(plan[3])
                let endTime = parseInt(plan[4])
                let symbol = plan[5]
                let symbolName = symbol
                let width = parseInt(plan[6])


                let mode = 'single'
                let height = 600
                //let interact_type = 'null'
                let parallel = 1
                let errorBound = 0.05


        


                let datasetname = table_name
                datasetname = datasetname.replace(/_/g, '');  // 使用正则表达式去掉所有的下划线

                let params =null
                let s = symbol.split('#')
                if (s.length > 1) {
                    params = s[1]
                } else {
                    params = []
                }
            
                let funInfo = new FunInfo(s[0],null,params)
                symbol = funInfo.funName


                symbol = getFuncName(symbolName);

                //console.log(i, plan, startTime, endTime, symbol, width)
                genDatainfo(screen_m4)
                let screen_m4 = new SCREEN_M4(experiment, datasetname, 0, symbolName, width, height, errorBound, funInfo)
                screen_m4.estimateType = 'estimateType'
                screen_m4.sx = 'sx'
                screen_m4.screenStart = startTime
                screen_m4.screenEnd = endTime
                screen_m4.interact_type = interact_type
                //screen_m4.memLimit = `${m}MB`
                screen_m4.columns = `${columns.join('I')}`

                

                errorBoundSatisfyCount = 0
                if (!isTreeCache) {
                    treeCache = {}
                }


                timeclear()
                timestart('totaltime')



                await Experiments(experiment, startTime, endTime, table_name, dataCount, columns, symbol, width, height, mode, parallel, errorBound, interact_type, screen_m4);
                timeend('totaltime');

                outputM4(screen_m4)


            }
        }

            
    }
   





    //console.log(ablationStudyDict)

}





function getFuncName(symbol) {
    let symbolName = symbol.split(';')[0];

    if (symbolName == 'plus') {
        symbolName = '+';
    } else if (symbolName == 'minus') {
        symbolName = '-';
    } else if (symbolName == 'multi') {
        symbolName = '*';
    } else if (symbolName == 'devide') {
        symbolName = '/';
    } else if (symbolName == 'boxcox0') {
        symbolName = 'boxcox_0';
    } else if (symbolName == 'boxcox12') {
        symbolName = 'boxcox_1_2';
    } else if (symbolName == 'boxcox1') {
        symbolName = 'boxcox_1';
    } else if (symbolName == 'boxcox2') {
        symbolName = 'boxcox_2';
    }
    return symbolName;
}





function getSymbolName(symbol) {
    let ss = symbol.split(';')
    let symbolName = ss[0];

    if (symbolName == '+') {
        symbolName = 'plus';
    } else if (symbolName == '-') {
        symbolName = 'minus';
    } else if (symbolName == '*') {
        symbolName = 'multi';
    } else if (symbolName == '/') {
        symbolName = 'devide';
    } else if (symbolName == 'boxcox_0') {
        symbolName = 'boxcox0';
    } else if (symbolName == 'boxcox_1_2') {
        symbolName = 'boxcox12';
    } else if (symbolName == 'boxcox_1') {
        symbolName = 'boxcox1';
    } else if (symbolName == 'boxcox_2') {
        symbolName = 'boxcox2';
    }


    if(ss.length > 1){
        symbolName = `${symbolName}#${ss[1]}`
    }
    return symbolName;
}

function generateTwoUniqueRandomNumbers(min, max) {
    let num1 = Math.floor(Math.random() * (max - min + 1)) + min;
    let num2;

    // 确保 num2 不等于 num1
    do {
        num2 = Math.floor(Math.random() * (max - min + 1)) + min;
    } while (num2 === num1);

    return [num1, num2];
}


function arraysAreEqual(arr1, arr2) {
    // 判断长度是否相同
    if (arr1.length != arr2.length) {
        return false;
    }

    // 遍历数组中的每一项，逐一比较
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] != arr2[i]) {
            return false;
        }
    }

    // 如果所有元素都相同，则返回 true
    return true;
}



function genColumns(totalColumns, computeColumns, tmp, symbol, rand = false){

    let count = 0

    //let tmp = []
    if (symbol == '+' || symbol == '-' || symbol == '*' || symbol == '/' || symbol == 'func4') {
        count = 2
    } else if (symbol == 'mean' || symbol == 'variance') {
        count = totalColumns.length
        //return false
    } else if(symbol == 'func1' || symbol == 'boxcox_0' || symbol == 'boxcox_1_2' || symbol == 'boxcox_1' || symbol == 'boxcox_2'){
        count = 1
    }

    if(!rand){
        computeColumns.length=0
        for(let i=0;i<count;i++){
            computeColumns.push(totalColumns[i])
        }
    }else{

        let [randomNum1, randomNum2] = generateTwoUniqueRandomNumbers(1, totalColumns.length);
        //console.log(randomNum1, randomNum2);

        if(count == 1){
            tmp.push(randomNum1)
        }else if(count == 2){
            tmp.push(randomNum1)
            tmp.push(randomNum2)
            // tmp.push(1)
            // tmp.push(2)

        }else{
            for(let i=0;i<count;i++){
                tmp.push(totalColumns[i])
            }
        }

    }

    
    return !arraysAreEqual(tmp, computeColumns)
    
}

function getPlansRandom(table, totalColumns, computeColumns, dataCount) {
    let functions=["func1", "boxcox_0", "+", "-", "*", "/", "func4", "mean", "variance"]
    
    let plans = ['change_func', 'change_column', 'resizeup', 'resizedown', 'zoomup', 'zoomdown', 'paningleft', 'paningright']
    let plan, symbol, width, startTime, endTime, maxEndTime
    maxEndTime = dataCount - 1
    startTime = Math.floor(maxEndTime/2)
    endTime = maxEndTime
    width = 600
    symbol = '+'

    let exists={}

    console.log(`${table} start ${computeColumns} ${startTime} ${endTime} ${symbol} ${width}`)

    for (let i = 0; i < 100; i++) {
        let rand = Math.floor(Math.random() * plans.length);
        let range = 0;
        let s,mid,e

        plan = plans[rand];
        switch (plan) {
            case 'change_func':
                rand = Math.floor(Math.random() * functions.length);
                if (symbol == functions[rand]) {
                    i--;
                    continue;
                }

                symbol = functions[rand];
                genColumns(totalColumns, computeColumns, [], symbol, false)

                //console.log('symbol',symbol)
                break;
            case 'change_column':
                let tmp = []

                if(genColumns(totalColumns, computeColumns, tmp, symbol, true)){
                    computeColumns = []
                    for(let c of tmp){
                        computeColumns.push(c)
                    }
                }else{
                    //console.log('same')
                    i--;
                    continue;
                }
                //console.log('computeColumns',computeColumns)
                break;
            case 'resizeup':
                if (width > 1200) {
                    i--;
                    continue;
                }
                width += 50;
                break;
            case 'resizedown':
                if (width < 200) {
                    i--;
                    continue;
                }
                width -= 50;
                break;
            case 'zoomup':
                //扩大1倍，相当于屏幕大小不变，时间范围缩小1倍
                 mid = Math.ceil((endTime + startTime) / 2)
                 s = Math.ceil((startTime + mid) / 2);
                 e = Math.floor((endTime + mid) / 2);
                if(e-s < dataCount/4){
                    i--;
                    continue;
                }else{
                    startTime = s
                    endTime = e
                }

                if(startTime < 0){
                    startTime = 0
                }

                if(endTime > maxEndTime){
                    endTime = maxEndTime
                }
                
                break;
            case 'zoomdown':
                //缩小1倍，相当于屏幕大小不变，时间范围扩大1倍
                if(startTime ==0 && endTime==maxEndTime){
                    i--;
                    continue;
                }
                range = Math.ceil(endTime - startTime);
                 e = endTime + range
                 s = startTime
                if(e > maxEndTime){
                    s = s - (e-maxEndTime)  
                    e=maxEndTime
                }
                if(s < 0){
                    s=0
                }

                startTime = s
                endTime = e

                break;
            case 'paningleft':
                range = Math.floor(endTime - startTime);
                rand = 0.1 + Math.random() * 0.5;
                range = Math.floor(range * rand);

                if (startTime - range < 0) {
                    i--;
                    continue;
                }

                startTime = Math.max(startTime - range, 0);
                endTime = Math.max(endTime - range, 0);

                break;
            case 'paningright':
                range = Math.floor(endTime - startTime);
                rand = 0.1 + Math.random() * 0.5;
                range = Math.floor(range * rand);

                if (endTime + range > maxEndTime) {
                    i--;
                    continue;
                }

                startTime = Math.min(startTime + range, maxEndTime);
                endTime = Math.min(endTime + range, maxEndTime);
                break;
        }

        let out = `${computeColumns} ${startTime} ${endTime} ${symbol} ${width}`

        // if(out in exists){
        //     i-- 
        //     continue
        // }else{
        //     exists[out] = 1
        // }
        
        console.log(`${table} ${plan} ${computeColumns} ${startTime} ${endTime} ${symbol} ${width}`)
        
    }
    //return `${table} ${plan} ${computeColumns} ${startTime} ${endTime} ${symbol} ${width}`;
}



async function getCount(tableName){
    if(!tableName.endsWith('_om3')){
        tableName =  tableName + '_om3';
    }

    const querySQL2 = `SELECT dataname,datanum FROM tablenum WHERE dataName = '${tableName}';`;
    //console.log(querySQL2)
    const result = await pool.query(querySQL2);

    return result.rows.length > 0 ? result.rows[0].datanum : 0;

}


let fout = null
let weights = [
    0.58, 0.04, 0.94,
    0.57, 0.09, 0.03,
    0.27, 0.26,  0.6,
    0.01, 0.47, 0.99
  ]

async function begin(){
    const args = process.argv.slice();
    let experimentType = args[2]

    if(experimentType == 'interactions'){
        console.log('interactions')
        await interactions()
    }else if(experimentType == 'static'){
        console.log('static')
        await static()
    }else if(experimentType == 'agg'){
        console.log('agg')
        await agg()
    }else if(experimentType == 'linenum'){
        console.log('linenum')
        await linenum()
    }else if(experimentType == 'tsnum'){
        console.log('tsnum')
        await tsnum()
    }
    
    
    else{
        await test()
    }

    pool.end()
}




let isMergeTable = true
let isTreeCache = true
let isParallel = true
let isMemLimit = false
let timelimit = 100 //100s
let procesStartTime = 0




// 使用profile函数计算并打印slowFunction的执行时间
profile( begin);


//genPlans()
