import json, os
d = 'datasets/enterprise_db'
# 查看行业监管大类和小类所有取值
samples = {'行业监管大类': set(), '行业监管小类': set()}
count = 0
for ent in os.listdir(d):
    entdir = os.path.join(d, ent)
    if os.path.isdir(entdir):
        for fn in os.listdir(entdir):
            if fn.endswith('.json'):
                data = json.load(open(os.path.join(entdir, fn), 'r', encoding='utf-8'))
                basic = data.get('详细数据',{}).get('企业基本信息',[])
                if basic:
                    b = basic[-1]
                    for k in ['行业监管大类','行业监管小类']:
                        v = b.get(k)
                        if v is not None:
                            samples[k].add(v)
print("行业监管大类:", sorted(samples['行业监管大类']))
print("行业监管小类:", sorted(samples['行业监管小类']))

# 查看金额/面积字段的典型值
samples2 = {}
for ent in os.listdir(d):
    entdir = os.path.join(d, ent)
    if os.path.isdir(entdir):
        for fn in os.listdir(entdir):
            if fn.endswith('.json'):
                data = json.load(open(os.path.join(entdir, fn), 'r', encoding='utf-8'))
                basic = data.get('详细数据',{}).get('企业基本信息',[])
                if basic:
                    b = basic[-1]
                    for k in ['占地面积','注册资金','上一年经营收入','企业上一年投入生产','固定资产']:
                        v = b.get(k)
                        if v is not None:
                            samples2.setdefault(k, set())
                            samples2[k].add(v)
for k in ['占地面积','注册资金','上一年经营收入','企业上一年投入生产','固定资产']:
    vs = list(samples2.get(k, set()))
    print(f"\n{k}: {len(vs)}个值 | 示例前10: {vs[:10]}")
