for f in ../data/csv/*.csv 
do
    echo $f
    filename="${f##*/}"    
    filename="${filename%%.*}"    
    echo $filename
    node ./postgres.js ../data/${f}
    node --max-old-space-size=204800 encodedata.js ${filename}
done

#init om3 data

# for f in "${inputfile[@]}" 
# do
#     #node --max-old-space-size=204800 encode_data_new.js ${f}
# done

