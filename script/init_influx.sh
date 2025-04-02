# influx 命令：
# docker exec influxdb_v2  influx bucket list --org influx --token I3nAb4l9-xc3tx1b3VQN1vxkRtNOVkccgvWBgIRXQEvuhwSA5crZFu_5_C9SMgOsbENKER9ic0PtWq0mSxqZrQ==
# docker exec influxdb_v2  influx query ' from(bucket: "synthetic10m2v") |> range(start: 0)  |> count() ' --token I3nAb4l9-xc3tx1b3VQN1vxkRtNOVkccgvWBgIRXQEvuhwSA5crZFu_5_C9SMgOsbENKER9ic0PtWq0mSxqZrQ== --org influx 



# #生成写入influx的数据文件。
# rm -rf ../data/lpdata/
# mkdir ../data/lpdata/

# for data in ../data/csv/*.csv; do
#     echo $data
#     node create_lp.js $data ../data/lpdata/
# done
# cp ../data/lpdata/* /data/zly/didi01/zhanglingyu/data/lpdata

# #数据写入influx

# influx bucket list --org influx --token ${INFLUX_TOKEN}

# for f in ../data/lpdata/*.lp
# do
#    echo "influx bucket create --name ${f}"
#    influx bucket create --name ${f}  
#    influx write --bucket ${f}   --precision s -f ../data/lpdata/${f}.lp

# done




INFLUX_TOKEN="I3nAb4l9-xc3tx1b3VQN1vxkRtNOVkccgvWBgIRXQEvuhwSA5crZFu_5_C9SMgOsbENKER9ic0PtWq0mSxqZrQ=="

ORG="influx"

for f in ../data/lpdata/*.lp
do
    bucket_name=$(basename "$f" .lp)

    echo "=============================="
    echo "Processing file: $f"
    echo "Target bucket: $bucket_name"

    # 检查是否存在同名的 bucket
    if docker exec influxdb_v2 influx bucket list --org $ORG --token $INFLUX_TOKEN | grep -q "$bucket_name"; then
        echo "Bucket ${bucket_name} already exists. Deleting it..."
        bucket_id=$(docker exec influxdb_v2 influx bucket list --org $ORG --token $INFLUX_TOKEN | grep "$bucket_name" | awk '{print $1}')
        if [ -n "$bucket_id" ]; then
            docker exec influxdb_v2 influx bucket delete --id "$bucket_id" --org $ORG --token $INFLUX_TOKEN
            echo "Deleted bucket: $bucket_name"
        else
            echo "Failed to get bucket ID for $bucket_name, skipping..."
            continue
        fi
    fi

    echo "Creating new bucket: ${bucket_name}"
    docker exec influxdb_v2 influx bucket create --name "$bucket_name" --org $ORG --token $INFLUX_TOKEN

    # 提取容器内的路径（你挂载为 /data/lpdata）
    container_file="/data/lpdata/$(basename "$f")"

    echo "Writing data to bucket ${bucket_name} from $container_file"
    docker exec influxdb_v2 influx write --bucket "$bucket_name" --org $ORG --token $INFLUX_TOKEN --precision s -f "$container_file"

    echo "Done with $bucket_name"
    echo "------------------------------"
done