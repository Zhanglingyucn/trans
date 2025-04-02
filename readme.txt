1、数据库配置，在
按照postgres、influxdb数据库
修改 initdb/dbconfig.json文件中相应的数据库连接信息。

2、将数据写入数据库：
postgres：

（1）t-v数据
（3）om3数据
    sh init_postgress.sh 

（2）vldb数据
黄硕、刘柯岐补充；

influxDB：
	sh init_influx.sh


3、运行实验程序
（1）static实验
运行程序
node applications.js static | grep experiment > ../output/static.txt

处理实验结果
    处理耗时结果
    mkdir ../result
    cat ../output/static.txt | grep experiment > ../result/experiment.txt

    处理ssim结果
        生成图片
        python createPhoto.py ../m4_result/ ../images/
        
        生成ssm图片
        python comparePhoto.py ../images/ ../compareresult/

        提取ssim数值
         ll ../compareresult/ > ../result/ssim.txt

合并耗时和ssim结果


（2）interact实验

    运行程序


    处理实验结果


（3）vldb实验
    运行程序
    mvn clean package
    java -jar target/experiments.jar -path new_nycdata.csv -c initialize -type postgres -out output -schema more -table vldbnycdata -timeFormat "yyyy-MM-dd[ HH:mm:ss.SSS]"
    mvn exec:java -Dexec.mainClass="gr.imsi.athenarc.visual.middleware.service.impl.QueryServiceImpl" -Dexec.args="-queryPath plans_nyc.csv -type postgres -schema more -agg 4 -reduction 0 -p 1 -q 0.1 -c run"
    
    处理实验结果



（4） 新实验
    运行程序
    cd voca/script
    node applications.js tsnum
    node applications.js linenum

    处理实验结果
    python createPhoto.py ../m4_result/ ../images/ 
    python comparePhoto.py ../images/ ../compareresult/

    ls ../compareresult/ |grep tsnum| awk -F'.png' 'BEGIN {print "method,data,type,colums,func,start,end,width,height,errorbound,error,ssim,iterations,totaltime,sqltime"} {gsub(/,/, ";");gsub(/_/, ","); print $1}' > ../output/tsnum.csv
    ls ../compareresult/ |grep linenum| awk -F'.png' 'BEGIN {print "method,data,type,colums,func,start,end,width,height,errorbound,error,ssim,iterations,totaltime,sqltime"} {gsub(/,/, ";");gsub(/_/, ","); print $1}' > ../output/linenum.csv
