

#对比图片，计算ssim
directory="../images"
##rm -rf ../compareresult
#mkdir ../compareresult

for image1 in "$directory"/*; do

    str=$image1
    # 获取第一个指定字符前面的部分
    om3=${str%%_*}
    om3=${om3##*/}
    
    echo ${om3}
    # if [ "$om3" != "om3" ] && [ "$om3" != "case3" ]; then
    #     continue
    # fi

    for image2 in "$directory"/*; do

        str=$image2
        # 获取第一个指定字符前面的部分
        case=${str%%_*}
        case=${case##*/}

        # if [[ "$case" == "$om3" ]]; then
        #     continue
        # fi

        if [[ "$case" != "PG-F" ]]; then
            continue
        fi

        # if [[ "$case" == "$om3" ]]; then
        #     continue
        # fi

        str=$image1
        delimiter="_"
        # 获取第一个指定字符后面的部分（去掉如case2、om3之类头部）
        experiment1="${str#*$delimiter}"
        # 获取第二个指定字符后面的部分（去掉数据reduce比例）
        experiment1="${experiment1#*$delimiter}"
        # 获取第三个指定字符后面的部分（去掉数据errorbound）
        experiment1="${experiment1#*$delimiter}"

        str=$image2
        delimiter="_"
        experiment2="${str#*$delimiter}"
        experiment2="${experiment2#*$delimiter}"
        experiment2="${experiment2#*$delimiter}"


            # if [[ "$experiment1" != "$experiment2" ]]; then
            #     #echo $experiment1  $experiment2
            #     continue
            # fi


        #echo "$om3  $case  $experiment1      $image1 $image2"
        python comparePhoto.py $image1 $image2 ../compareresult/

        echo

    done
done



