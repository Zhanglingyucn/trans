

# #根据m4生成图片
#rm -rf ../images
#mkdir ../images
directory="../m4_result"

for m4 in "$directory"/*; do
  # 确保是文件而非目录
  if [ -f "$m4" ]; then
    echo "$m4 to image"
    python createPhoto.py $m4 ../images/
    # 读取文件内容
    #cat "$m4"
    echo
  fi
done
