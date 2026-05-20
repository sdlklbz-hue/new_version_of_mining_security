import pandas as pd, os

base = r'c:\Users\sdlkl\Desktop\合并\mining_risk_agent-master\new_data'

# 检查所有 xlsx 和 csv 的列名
for root, dirs, files in os.walk(base):
    for f in sorted(files):
        if not (f.endswith('.xlsx') or f.endswith('.csv')):
            continue
        fp = os.path.join(root, f)
        try:
            if f.endswith('.xlsx'):
                df = pd.read_excel(fp, nrows=1)
            else:
                for enc in ('utf-8-sig', 'utf-8', 'gbk'):
                    try:
                        df = pd.read_csv(fp, encoding=enc, nrows=1)
                        break
                    except:
                        continue
            cols = list(df.columns)
            # Filter enterprise-name-like and ID-like columns
            name_cols = [c for c in cols if any(k in c.upper() for k in ('NAME', '企业', '名称', '单位', '公司'))]
            id_cols = [c for c in cols if any(k in c.upper() for k in ('ID', '信用代码', '主键', '编码', '组织机构'))]
            if name_cols or id_cols:
                rel = os.path.relpath(fp, base)
                print(f'\n=== {rel} ===')
                if name_cols:
                    print(f'  企业名列: {name_cols}')
                    for c in name_cols[:3]:
                        print(f'    eg: {df[c].iloc[0]}')
                if id_cols:
                    print(f'  ID列: {id_cols[:8]}')
        except Exception as e:
            print(f'{f}: error - {e}')
