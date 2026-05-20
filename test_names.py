import requests
import json

base = "http://localhost:8000/api/v1/memory"

r = requests.post(f"{base}/batch-assess")
d = r.json()
results = d.get("results", [])

code_names = []
for x in results:
    name = x.get("enterprise_name", "")
    eid = x.get("enterprise_id", "")
    if name == eid or name == "unknown":
        code_names.append({"eid": eid[:50], "name": name[:50]})

print(f"Total: {len(results)}, Unresolved: {len(code_names)}")

prefixes = {}
for c in code_names:
    eid = c["eid"]
    prefix = eid[:4] if len(eid) >= 4 else eid
    prefixes[prefix] = prefixes.get(prefix, 0) + 1

print("\nID prefix distribution:")
for p, cnt in sorted(prefixes.items(), key=lambda x: -x[1])[:20]:
    print(f"  {p}*: {cnt}")

credit_like = sum(1 for c in code_names if c["eid"].startswith("913"))
print(f"\nCredit code like (913*): {credit_like}")

ep_like = sum(1 for c in code_names if c["eid"].startswith("EP"))
print(f"EP like: {ep_like}")

plan_like = sum(1 for c in code_names if c["eid"][:4].isdigit() and len(c["eid"]) > 10)
print(f"Plan ID like: {plan_like}")

uuid_like = sum(1 for c in code_names if "-" in c["eid"] and len(c["eid"]) > 20)
print(f"UUID like: {uuid_like}")

other = len(code_names) - credit_like - ep_like - plan_like - uuid_like
if code_names and code_names[0]["eid"] == "unknown":
    other -= 1
print(f"Other: {other}")
print(f"unknown: {sum(1 for c in code_names if c['eid'] == 'unknown')}")
