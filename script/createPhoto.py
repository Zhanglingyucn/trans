import sys
import matplotlib.pyplot as plt
import numpy as np
import time
import os

def process_data(file_path, dirname):
    # 读取并解析文件头信息
    header_info = {}
    experiment_values = []  # 用于保存从experiment开始的值
    try:
        with open(file_path, 'r') as file:
            first_line = file.readline().strip()  # 读取第一行
            for item in first_line.split(";"):  # 分割多个键值对
                if ":" in item:
                    key, value = map(str.strip, item.split(":", 1))  # 确保只分割第一个冒号
                    header_info[key] = value
                    # 提取从 "experiment" 开始的键值
                    # if key in ["experiment", "table", "symbol", "errorBound","dataReductionRatio"]:
                    #     experiment_values.append(value)  # 保留原始值
    except Exception as e:
        print(f"读取文件头信息失败: {e}")
        sys.exit(1)

    # 使用解析的头信息
    width = int(header_info.get('width', 600))  # 默认值为600
    height = int(header_info.get('height', 600))  # 默认值为600
    
    
    output_path = f'{dirname}/{header_info["experiment"]}_{header_info["error"]}_{header_info["errorBound"]}_{header_info["table"]}_{header_info["interacttype"]}_{header_info["columns"]}_{header_info["symbol"]}_{header_info["startTime"]}_{header_info["endTime"]}_{width}_{height}_{header_info["iterations"]}_{header_info["totaltime"]}_{header_info["sqltime"]}.png'
    if os.path.exists(output_path):
        print(f"{output_path} 文件存在")
        return

    # 手动解析数据部分
    data = {
        "sT": [],
        "eT": [],
        "sV": [],
        "eV": [],
        "min": [],
        "max": []
    }
    try:
        with open(file_path, 'r') as file:
            next(file)  # 跳过第一行头信息
            for line in file:
                line = line.strip()
                if not line or "sT:" not in line:  # 跳过空行或不包含"sT:"的行
                    continue
                try:
                    # 提取从 "sT:" 开始的有效数据
                    start_index = line.find("sT:")
                    if start_index == -1:  # 如果没有找到 "sT:"，跳过此行
                        print(f"跳过无效行: {line}")
                        continue
                    line = line[start_index:]  # 去掉 "sT:" 之前的内容
                    # 提取数据中的键值对
                    row_data = {item.split(":")[0].strip(): float(item.split(":")[1].strip()) for item in line.split(",") if ":" in item}
                    # 将数据追加到相应的列
                    data["sT"].append(row_data.get("sT", 0))
                    data["eT"].append(row_data.get("eT", 0))
                    data["sV"].append(row_data.get("sV", 0))
                    data["eV"].append(row_data.get("eV", 0))
                    data["min"].append(row_data.get("min", 0))
                    data["max"].append(row_data.get("max", 0))
                except Exception as e:
                    print(f"跳过无效行: {line}，错误: {e}")
    except Exception as e:
        print(f"读取数据部分失败: {e}")
        sys.exit(1)

    # 处理数据，生成绘图点
    x_values = []
    y_values = []
    for sT, eT, sV, eV, min_val, max_val in zip(data['sT'], data['eT'], data['sV'], data['eV'], data['min'], data['max']):
        mid = (sT + eT) / 2
        x_values.extend([sT, mid, mid, eT])
        y_values.extend([sV, min_val, max_val, eV])

    # 计算x轴和y轴的范围
    x_min = min(data['sT'] + data['eT'])
    x_max = max(data['sT'] + data['eT'])
    y_min = min(data['sV'] + data['eV'] + data['min'] + data['max'])
    y_max = max(data['sV'] + data['eV'] + data['min'] + data['max'])

    # 动态增加上下边距
    y_min -= abs(y_min) * 0.1
    y_max += abs(y_max) * 0.1

    # 根据新的 y_min 和 y_max 生成合理的刻度间隔
    y_ticks_interval = (y_max - y_min) / 10  # 动态设置为 10 个区间
    # y_ticks = np.arange(y_min, y_max + y_ticks_interval, y_ticks_interval)

    # 生成高分辨率图表
    dpi = 600  # 设置高DPI以提高分辨率
    plt.figure(figsize=(width / 100, height / 100), dpi=dpi)
    plt.plot(x_values, y_values, linestyle='-', color='steelblue', alpha=1.0, linewidth=0.6)  # 线条更细，更锐利
    plt.axhline(0, color='gray', linewidth=0.5, linestyle=':')  # 水平线
    # plt.title("TXT Data Visualization")
    # plt.xlabel("t")
    # plt.ylabel("v")
    # plt.grid(True, linestyle='--', alpha=0.5)  # 网格线

    # 设置x轴和y轴的范围
    plt.xlim(x_min, x_max)
    plt.ylim(y_min, y_max)  # 动态调整Y轴范围，包含缓冲

    # 设置 X, Y 轴刻度
    plt.xticks([])
    plt.yticks([])
    plt.gca().spines['top'].set_visible(False)
    plt.gca().spines['right'].set_visible(False)

    # 使用从 experiment 开始的值生成文件名
    experiment_name = "_".join(experiment_values)
    #print(header_info)

    
    try:
        plt.savefig(output_path, dpi=dpi, bbox_inches='tight')  # 设置tight避免空隔
        print(f"图片已成功保存到: {output_path}")
    except Exception as e:
        print(f"保存图片失败: {e}")
    finally:
        plt.close()

if __name__ == "__main__":
    
    if len(sys.argv) != 3:
        print(sys.argv)
        print("使用方法: python createPhoto.py <m4 目录路径> <生成图片保存目录>")
        sys.exit(1)


    intput_path = sys.argv[1]
    output_path = sys.argv[2]


    files_in_directory = os.listdir(intput_path)
    for txt_file_path in files_in_directory: 
        txt_file_path = f"{intput_path}/{txt_file_path}"
        print(f"{txt_file_path} to image")
        
        
        start_time = time.time()
        
        process_data(txt_file_path, output_path)
        
        end_time = time.time()
        elapsed_time = end_time - start_time
        print(f"函数执行时间: {elapsed_time:.4f} 秒")
    











