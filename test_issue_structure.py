#!/usr/bin/env python3
"""
測試 legal_issues 和 issue_tilt_by_party 的對應關係
"""

import json

# 讀取判決書
with open('TPHV,111,上,397,20250730,1.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

legal_issues = data.get('legal_issues', [])
issue_tilts = data.get('issue_tilt_by_party', [])

print("=" * 80)
print("legal_issues 結構:")
print("=" * 80)
for i, issue in enumerate(legal_issues[:3], 1):
    print(f"\n{i}. cited_para_id: {issue.get('cited_para_id')}")
    print(f"   question: {issue.get('question')[:50]}...")
    print(f"   有 topic? {('topic' in issue)}")
    print(f"   有 issue_id? {('issue_id' in issue)}")

print("\n" + "=" * 80)
print("issue_tilt_by_party 結構:")
print("=" * 80)
for i, tilt in enumerate(issue_tilts[:3], 1):
    print(f"\n{i}. issue_id: {tilt.get('issue_id')}")
    print(f"   basis_para: {tilt.get('basis_para')}")
    print(f"   topic: {tilt.get('topic')}")
    print(f"   favored_party: {tilt.get('favored_party')}")

print("\n" + "=" * 80)
print("對應關係測試:")
print("=" * 80)
for issue in legal_issues[:3]:
    cited_para_id = issue.get('cited_para_id')
    # 嘗試匹配
    tilt = next((t for t in issue_tilts if t.get('issue_id') == cited_para_id), None)
    
    print(f"\ncited_para_id: {cited_para_id}")
    if tilt:
        print(f"  ✅ 找到匹配的 tilt")
        print(f"  topic: {tilt.get('topic')}")
        print(f"  favored_party: {tilt.get('favored_party')}")
    else:
        print(f"  ❌ 沒有找到匹配的 tilt")

