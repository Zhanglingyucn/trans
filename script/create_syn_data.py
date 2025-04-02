import pandas as pd
import numpy as np
import random
import os  # 引入 os 模块用于文件夹操作
import sys

def random_walk(
        values, start_value=0, threshold=0.5,
        step_size=1, min_value=0, max_value=np.inf
):
    previous_value = start_value
    for index in range(len(values)):
        if previous_value < min_value:
            previous_value = min_value
        if previous_value > max_value:
            previous_value = max_value
        probability = random.random()
        if probability >= threshold:
            values[index] = previous_value + step_size
        else:
            values[index] = previous_value - step_size
        previous_value = values[index]
    return values


# 定义开始和结束日期
DATE_START = '2016-01-01'
DATE_END = '2020-01-01'

# 定义不同频率的日期范围
dates = {}
dates["1m"] = pd.date_range(DATE_START, DATE_END, freq="2min")
dates["2m"] = pd.date_range(DATE_START, DATE_END, freq="1min")
dates["4m"] = pd.date_range(DATE_START, DATE_END, freq="32s")
dates["8m"] = pd.date_range(DATE_START, DATE_END, freq="16s")
dates["16m"] = pd.date_range(DATE_START, DATE_END, freq="8s")
dates["32m"] = pd.date_range(DATE_START, DATE_END, freq="4s")
dates["64m"] = pd.date_range(DATE_START, DATE_END, freq="2s")
dates["128m"] = pd.date_range(DATE_START, DATE_END, freq="1s")
dates["256m"] = pd.date_range(DATE_START, DATE_END, freq="500ms")

# 将开始日期转换为 Timestamp 对象，方便后续计算差值
start_datetime = pd.to_datetime(DATE_START)

outoutdir = sys.argv[1]

# 生成 5 组数据
for i in range(5):
    for key, date_range in dates.items():
        # 初始化值数组
        values = np.empty(date_range.size)
        # 执行随机游走
        random_walk(values, min_value=2)

        # 计算 't' 为自开始日期以来的毫秒差值，并转换为整数
        t_values = np.arange(len(values))

        # 创建 DataFrame 并重命名列为 't' 和 'v'
        df = pd.DataFrame({
            't': t_values,
            'v': values
        })

        # 创建对应频率的文件夹，例如 synthetic_1M
        folder_name = f"{outoutdir}/synthetic_{key}"
        os.makedirs(folder_name, exist_ok=True)

        # 定义文件路径并保存 CSV 文件
        file_path = os.path.join(folder_name, f"synthetic_{key}_{i}.csv")
        df.to_csv(file_path, index=False)

print("数据生成完成，文件已按频率分类存储。")
