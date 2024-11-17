symbolarray=("+" "-" "*" "/")
experimentarray=("om3" "case1")

for e in "${experimentarray[@]}"
do
    for s in "${symbolarray[@]}"
    do  

        echo "$e $s start:"
        for i in {1..100}
        do
            node functions_noArrayTree.js nyc_bronx_green_minute_om3 nyc_bronx_yellow_minute_om3 "$s;1,-1" single 1000 1000 "0" "-1" "timebox" $e 1 0.05 | grep 'start' | awk '{print $2}'
        done | awk '
        {
            if ($1 ~ /ms$/) {                      # 如果时间以 "ms" 结尾
                value = substr($1, 1, length($1)-2) # 提取数值部分
                sum += value / 1000                 # 转换为秒并累加
            } else if ($1 ~ /s$/) {                # 如果时间以 "s" 结尾
                value = substr($1, 1, length($1)-1) # 提取数值部分
                sum += value                        # 累加秒
            }
            count++                                # 计数行数
            print count,value
        }
        END {
            if (count > 0) {
                print "Average (seconds):", sum / count # 计算并输出平均值
            } else {
                print "No valid data to process."
            }
        }'

        echo "$e $s end!\n\n"
    done
done
