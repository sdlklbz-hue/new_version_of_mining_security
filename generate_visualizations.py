import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import os

np.random.seed(42)

output_dir = "reports/figures"
os.makedirs(output_dir, exist_ok=True)

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False

def generate_early_warning_trend_data():
    dates = pd.date_range(start='2024-01-01', end='2024-12-31', freq='D')
    n_days = len(dates)

    # ===== 放大波动 =====
    base_trend = np.linspace(0, 350, n_days)
    seasonal = 120 * np.sin(2 * np.pi * np.arange(n_days) / (365.25 / 12) * 12)
    weekly_pattern = 70 * np.sin(2 * np.pi * np.arange(n_days) / (7 / 8))
    noise = np.random.normal(0, 80, n_days)

    trend_values = base_trend + seasonal + weekly_pattern + noise
    trend_values = np.maximum(trend_values, 0).astype(int)

    high_risk_pcts = 0.15 + 0.30 * np.sin(2 * np.pi * np.arange(n_days) / 50) + np.random.normal(0, 0.12, n_days)
    high_risk_pcts = np.clip(high_risk_pcts, 0.01, 0.55)
    medium_risk_pcts = 0.30 + 0.35 * np.sin(2 * np.pi * np.arange(n_days) / 35 + 2.0) + np.random.normal(0, 0.15, n_days)
    medium_risk_pcts = np.clip(medium_risk_pcts, 0.02, 0.70)
    high_risk_warnings = (trend_values * high_risk_pcts).astype(int)
    medium_risk_warnings = (trend_values * medium_risk_pcts).astype(int)
    low_risk_warnings = trend_values - high_risk_warnings - medium_risk_warnings
    low_risk_warnings = np.maximum(low_risk_warnings, 0).astype(int)

    df = pd.DataFrame({
        '日期': dates,
        '预警总数': trend_values,
        '高风险预警': high_risk_warnings,
        '中风险预警': medium_risk_warnings,
        '低风险预警': low_risk_warnings
    })

    return df

def plot_early_warning_trend_chart():
    df = generate_early_warning_trend_data()

    fig, ax = plt.subplots(figsize=(14, 7))

    ax.fill_between(df['日期'], df['预警总数'], alpha=0.3, color='#3498db', label='预警总数区域')
    ax.plot(df['日期'], df['预警总数'], color='#3498db', linewidth=2, marker='', label='预警总数')

    ax.plot(df['日期'], df['高风险预警'], color='#e74c3c', linewidth=1.5,
            linestyle='--', alpha=0.8, label='高风险预警')
    ax.plot(df['日期'], df['中风险预警'], color='#f39c12', linewidth=1.5,
            linestyle='-.', alpha=0.8, label='中风险预警')
    ax.plot(df['日期'], df['低风险预警'], color='#27ae60', linewidth=1.5,
            linestyle=':', alpha=0.8, label='低风险预警')

    monthly_dates = df['日期'][::30]
    ax.set_xticks(monthly_dates)
    ax.set_xticklabels([d.strftime('%Y-%m') for d in monthly_dates], rotation=45, ha='right')

    ax.set_xlabel('时间（月份）', fontsize=12, fontweight='bold')
    ax.set_ylabel('预警数量（次）', fontsize=12, fontweight='bold')
    ax.set_title('2024年矿山安全预警生成趋势图\nEarly Warning Generation Trend Chart',
                 fontsize=14, fontweight='bold', pad=20)

    ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
    ax.grid(True, alpha=0.3, linestyle='-')
    ax.set_ylim(bottom=0)

    avg_line = df['预警总数'].mean()
    ax.axhline(y=avg_line, color='#9b59b6', linestyle='--', linewidth=1.5, alpha=0.7)
    ax.text(df['日期'].iloc[-1], avg_line + 2, f'平均值: {avg_line:.1f}',
            fontsize=10, color='#9b59b6', ha='right')

    peak_idx = df['预警总数'].idxmax()
    peak_date = df.loc[peak_idx, '日期']
    peak_value = df.loc[peak_idx, '预警总数']
    ax.annotate(f'峰值: {peak_value}\n{peak_date.strftime("%Y-%m-%d")}',
                xy=(peak_date, peak_value),
                xytext=(peak_date + timedelta(days=20), peak_value + 5),
                arrowprops=dict(arrowstyle='->', color='#e74c3c', lw=1.5),
                fontsize=9, color='#e74c3c', fontweight='bold')

    plt.tight_layout()
    output_path = os.path.join(output_dir, 'early_warning_trend_chart.png')
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()

    print(f"[OK] 预警趋势图已保存: {output_path}")
    print(f"  数据范围: {df['日期'].min().strftime('%Y-%m-%d')} 至 {df['日期'].max().strftime('%Y-%m-%d')}")
    print(f"  总预警次数: {df['预警总数'].sum()}")
    print(f"  日均预警: {df['预警总数'].mean():.1f} 次")
    return output_path

def generate_correlation_scatter_data():
    n_samples = 150

    equipment_failure_rate = np.random.uniform(5, 35, n_samples)
    safety_incidents = (equipment_failure_rate * 0.8 +
                       np.random.normal(0, 3, n_samples) +
                       np.random.uniform(-5, 5, n_samples))
    safety_incidents = np.maximum(safety_incidents, 0)

    df = pd.DataFrame({
        '设备故障率': equipment_failure_rate.round(2),
        '安全事故数': safety_incidents.round(1)
    })

    return df

def plot_correlation_scatter():
    df = generate_correlation_scatter_data()

    fig, ax = plt.subplots(figsize=(10, 8))

    scatter = ax.scatter(df['设备故障率'], df['安全事故数'],
                        c=df['安全事故数'], cmap='RdYlGn_r',
                        s=80, alpha=0.7, edgecolors='black', linewidth=0.5)

    z = np.polyfit(df['设备故障率'], df['安全事故数'], 1)
    p = np.poly1d(z)
    x_line = np.linspace(df['设备故障率'].min(), df['设备故障率'].max(), 100)
    ax.plot(x_line, p(x_line), 'b--', linewidth=2, alpha=0.8, label=f'趋势线 (斜率: {z[0]:.2f})')

    correlation = df['设备故障率'].corr(df['安全事故数'])
    ax.text(0.05, 0.95, f'相关系数 (r): {correlation:.3f}',
            transform=ax.transAxes, fontsize=12, fontweight='bold',
            verticalalignment='top',
            bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))

    cbar = plt.colorbar(scatter, ax=ax, shrink=0.8)
    cbar.set_label('安全事故数量', fontsize=11, fontweight='bold')

    ax.set_xlabel('设备故障率 (%)', fontsize=12, fontweight='bold')
    ax.set_ylabel('安全事故数量（起）', fontsize=12, fontweight='bold')
    ax.set_title('设备故障率与安全事故相关性散点图\nCorrelation Scatter Plot: Equipment Failure Rate vs Safety Incidents',
                 fontsize=13, fontweight='bold', pad=15)

    ax.legend(loc='lower right', fontsize=10)
    ax.grid(True, alpha=0.3, linestyle='-')

    mean_x = df['设备故障率'].mean()
    mean_y = df['安全事故数'].mean()
    ax.axvline(x=mean_x, color='gray', linestyle=':', linewidth=1.5, alpha=0.6)
    ax.axhline(y=mean_y, color='gray', linestyle=':', linewidth=1.5, alpha=0.6)
    ax.plot(mean_x, mean_y, 'r*', markersize=15, label=f'均值点 ({mean_x:.1f}, {mean_y:.1f})')

    ax.set_xlim([0, 40])
    ax.set_ylim([0, df['安全事故数'].max() * 1.1])

    plt.tight_layout()
    output_path = os.path.join(output_dir, 'correlation_scatter_plot.png')
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()

    print(f"[OK] 相关性散点图已保存: {output_path}")
    print(f"  样本数量: {len(df)}")
    print(f"  相关系数: {correlation:.3f}")
    print(f"  设备故障率范围: {df['设备故障率'].min():.1f}% - {df['设备故障率'].max():.1f}%")
    return output_path

def generate_correlation_heatmap_data():
    n_samples = 200

    data = {
        '设备完好率': np.random.uniform(70, 99, n_samples),
        '安全培训时长': np.random.uniform(10, 80, n_samples),
        '隐患排查数量': np.random.randint(50, 300, n_samples),
        '员工安全意识评分': np.random.uniform(60, 100, n_samples),
        '应急预案演练次数': np.random.randint(2, 24, n_samples),
        '安全投入': np.random.uniform(100, 800, n_samples),
        '事故发生率': np.random.uniform(0.5, 8.0, n_samples),
        '违规操作次数': np.random.randint(5, 80, n_samples)
    }

    data['事故发生率'] = (
        10 - data['设备完好率'] * 0.08 -
        data['安全培训时长'] * 0.02 -
        data['隐患排查数量'] * 0.005 -
        data['员工安全意识评分'] * 0.03 -
        data['应急预案演练次数'] * 0.1 -
        data['安全投入'] * 0.003 +
        data['违规操作次数'] * 0.05 +
        np.random.normal(0, 0.8, n_samples)
    )
    data['事故发生率'] = np.clip(data['事故发生率'], 0.5, 8.0)

    data['违规操作次数'] = (
        100 - data['员工安全意识评分'] * 0.7 -
        data['安全培训时长'] * 0.3 +
        np.random.normal(0, 8, n_samples)
    )
    data['违规操作次数'] = np.clip(data['违规操作次数'], 5, 80).astype(int)

    df = pd.DataFrame(data)
    return df

def plot_correlation_heatmap():
    df = generate_correlation_heatmap_data()

    corr_matrix = df.corr()

    fig, ax = plt.subplots(figsize=(12, 10))

    mask = np.triu(np.ones_like(corr_matrix, dtype=bool), k=1)

    sns.heatmap(corr_matrix,
                mask=mask,
                annot=True,
                fmt='.2f',
                cmap='RdBu_r',
                center=0,
                square=True,
                linewidths=0.5,
                cbar_kws={"shrink": 0.8, "label": "相关系数"},
                annot_kws={'size': 9, 'fontweight': 'bold'},
                vmin=-1, vmax=1,
                ax=ax)

    ax.set_title('矿山安全指标相关性热力图\nCorrelation Heatmap: Mining Safety Indicators',
                 fontsize=14, fontweight='bold', pad=20)

    ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha='right', fontsize=10)
    ax.set_yticklabels(ax.get_yticklabels(), rotation=0, fontsize=10)

    plt.tight_layout()
    output_path = os.path.join(output_dir, 'correlation_heatmap.png')
    plt.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()

    strong_corr_pairs = []
    for i in range(len(corr_matrix.columns)):
        for j in range(i+1, len(corr_matrix.columns)):
            corr_val = corr_matrix.iloc[i, j]
            if abs(corr_val) > 0.5:
                pair = (corr_matrix.columns[i], corr_matrix.columns[j], corr_val)
                strong_corr_pairs.append(pair)

    print(f"[OK] 相关性热力图已保存: {output_path}")
    print(f"  变量数量: {len(df.columns)}")
    print(f"  样本数量: {len(df)}")
    print(f"  强相关变量对 (|r| > 0.5):")
    for pair in sorted(strong_corr_pairs, key=lambda x: abs(x[2]), reverse=True)[:5]:
        print(f"    - {pair[0]} <-> {pair[1]}: r = {pair[2]:.3f}")

    return output_path

if __name__ == '__main__':
    print("=" * 60)
    print("开始生成三个数据可视化图表")
    print("Generating Three Data Visualizations")
    print("=" * 60)
    print()

    print("[1/3] 生成早期预警趋势图...")
    path1 = plot_early_warning_trend_chart()
    print()

    print("[2/3] 生成相关性散点图...")
    path2 = plot_correlation_scatter()
    print()

    print("[3/3] 生成相关性热力图...")
    path3 = plot_correlation_heatmap()
    print()

    print("=" * 60)
    print("[SUCCESS] 所有可视化图表生成完成!")
    print("All Visualizations Generated Successfully!")
    print("=" * 60)
    print(f"\n输出目录: {os.path.abspath(output_dir)}")
    print("\n生成的文件:")
    print(f"  1. {path1}")
    print(f"  2. {path2}")
    print(f"  3. {path3}")
