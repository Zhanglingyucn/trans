import os
import sys
import numpy as np
import matplotlib.pyplot as plt
from skimage import img_as_float, io
from skimage.metrics import structural_similarity as ssim, mean_squared_error
from skimage.transform import resize
import time

def parse_filename(filename):
    """
    从文件名中提取表名和关键信息，生成描述字符串。
    文件名格式：case1_mock1_0_+_0.05_600_600.png
    """
    try:
        # 去掉路径和扩展名，只保留文件名部分
        name = os.path.splitext(os.path.basename(filename))[0]
        # 按下划线分割文件名
        parts = name.split('_')
        #print(parts)
        if len(parts) < 7:  # 确保至少包含7个部分
            raise ValueError("文件名格式不正确，无法提取关键信息")
        
        # 提取关键字段
        case = parts[0]
        error = parts[1]
        error_bound = parts[2]  # 确保包括小数点
        table = parts[3]
        interacttype = parts[4]
        columns = parts[5]
        symbol = parts[6]
        startTime = parts[7]
        endTime  = parts[8]
        width = parts[9]
        height = parts[10]
        iterations = parts[11]
        totaltime = parts[12]
        sqltime = parts[13]
        
        # 按顺序返回描述字符串
        return case, f"{table}_{interacttype}_{columns}_{symbol}_{startTime}_{endTime}_{width}_{height}", error, error_bound, iterations, totaltime, sqltime
    except Exception as e:
        print(f"解析文件名失败: {e}")
        return "无法提取关键信息", "无法提取关键信息"


def main(file1, file2, output_path):
    # if len(sys.argv) != 4:
    #     print("使用方法: python comparePhoto.py <图片1路径> <图片2路径> <输出路径>")
    #     sys.exit(1)

    # # 从命令行获取图片路径和输出路径
    # file1 = sys.argv[1]
    # file2 = sys.argv[2]
    # output_path = sys.argv[3]
    
    # 获取文件名中的 case 信息和详细信息
    case1, info1, error1, error_bound1, iterations1, totaltime1, sqltime1 = parse_filename(file1)
    case2, info2, error2, error_bound2, iterations2, totaltime2, sqltime2 = parse_filename(file2)

    if info1!=info2:
        #print(case1, error1, error_bound1, info1)
        #print(case2, error2, error_bound2, info2)
        return

    file_prefix = f"{case1}_{info1}_{error_bound1}_{error1}_"
    directory = output_path
    # 获取目录下所有文件的列表
    files_in_directory = os.listdir(directory)

    # 判断是否有文件以给定前缀开始
    file_found = any(f.startswith(file_prefix) for f in files_in_directory)

    if file_found:
        print(f"{file_prefix} 已存在")
        return
    


    try:
        # 加载两张图片
        img1 = img_as_float(io.imread(file1, as_gray=True))
        img2 = img_as_float(io.imread(file2, as_gray=True))
    except FileNotFoundError as e:
        print(f"文件未找到: {e}")
        sys.exit(1)

    # 调整图像尺寸以确保一致
    if img1.shape != img2.shape:
        img2 = resize(img2, img1.shape, anti_aliasing=True)

    # 计算 MSE 和 SSIM
    mse_value = mean_squared_error(img1, img2)
    ssim_value = ssim(img1, img2, data_range=img2.max() - img2.min())


    #print(info2)
    print(f"MSE: {mse_value:.4f}, SSIM: {ssim_value:.4f}")

    # 显示两张图片和相似度结果
    fig, axes = plt.subplots(nrows=1, ncols=2, figsize=(10, 5))
    ax = axes.ravel()

    ax[0].imshow(img1, cmap=plt.cm.gray, vmin=0, vmax=1)
    ax[0].set_title(f'{case1}')  # 使用文件名中的 case 作为标题

    ax[1].imshow(img2, cmap=plt.cm.gray, vmin=0, vmax=1)
    ax[1].set_title(f'{case2}')  # 使用文件名中的 case 作为标题

    # 设置标题
    plt.suptitle(f'MSE: {mse_value:.2f}, SSIM: {ssim_value:.2f}', fontsize=16)
    plt.tight_layout()

    # 保存比较图像
    #output_filename = f"{os.path.splitext(os.path.basename(file1))[0]}_VS_{os.path.splitext(os.path.basename(file2))[0]}_ssim{ssim_value:.4f}.png"
    output_filename = f"{case1}_{info1}_{error_bound1}_{error1}_{ssim_value:.4f}_{iterations1}_{totaltime1}_{sqltime1}.png"
    output_filepath = os.path.join(output_path, output_filename)
    plt.savefig(output_filepath)
    
    print(file1)
    print(file2)
    print(f"比较图像已保存至: {output_filepath}")

    # 关闭图像窗口
    plt.close()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("使用方法: python comparePhoto.py <待处理图片路径> <输出路径>")
        sys.exit(1)

    # 从命令行获取图片路径和输出路径
    intput_path = sys.argv[1]
    output_path = sys.argv[2]
    
    files_in_directory = os.listdir(intput_path)
    for file1 in files_in_directory: 
        file1 = f"{intput_path}/{file1}"
        for file2 in files_in_directory:
            file2 = f"{intput_path}/{file2}"
            case1, info1, error1, error_bound1, iterations1, totaltime1, sqltime1 = parse_filename(file1)
            case2, info2, error2, error_bound2, iterations2, totaltime2, sqltime2 = parse_filename(file2)

            if case2 != "PG-F":
                continue
            if info1!=info2:
                continue
        
            #print(file1)
            #print(file2)
            #print()
            #sys.exit(1)
            
            
            start_time = time.time()
            main(file1, file2, output_path)
            end_time = time.time()
            elapsed_time = end_time - start_time
            print(f"函数执行时间: {elapsed_time:.4f} 秒")
            print()
