"""
Quick snapshot inspection tool
Shows exactly what data is in the snapshot/SSE stream
"""
import requests
import json
import sys

API_BASE = "http://localhost:8080"

def inspect_snapshot():
    """Fetch and pretty-print snapshot"""
    print("🔍 Fetching /api/snapshot...\n")
    
    try:
        resp = requests.get(f"{API_BASE}/api/snapshot", timeout=5)
        if resp.status_code != 200:
            print(f"❌ Error: HTTP {resp.status_code}")
            print(resp.text)
            return
        
        data = resp.json()
        
        print("="*80)
        print("📸 SNAPSHOT DATA")
        print("="*80 + "\n")
        
        if not data:
            print("⚠️  Empty snapshot!")
            return
        
        for kort, state in data.items():
            print(f"\n🎾 COURT {kort}")
            print("-" * 40)
            
            # Basic info
            print(f"Overlay Visible: {state.get('overlay_visible')}")
            print(f"Mode: {state.get('mode')}")
            print(f"Current Set: {state.get('current_set')}")
            print(f"Serve: {state.get('serve')}")
            
            # Player A
            a_state = state.get('A', {})
            print(f"\n👤 Player A:")
            print(f"   Name: {a_state.get('full_name') or a_state.get('surname')}")
            print(f"   Points: {a_state.get('points')}")
            print(f"   Current Games: {a_state.get('current_games')}")
            print(f"   Set 1: {a_state.get('set1')}")
            print(f"   Set 2: {a_state.get('set2')}")
            
            # Player B
            b_state = state.get('B', {})
            print(f"\n👤 Player B:")
            print(f"   Name: {b_state.get('full_name') or b_state.get('surname')}")
            print(f"   Points: {b_state.get('points')}")
            print(f"   Current Games: {b_state.get('current_games')}")
            print(f"   Set 1: {b_state.get('set1')}")
            print(f"   Set 2: {b_state.get('set2')}")
            
            # Tie-break
            tie = state.get('tie', {})
            if tie.get('visible'):
                print(f"\n🔥 Tie-break:")
                print(f"   A: {tie.get('A')}")
                print(f"   B: {tie.get('B')}")
            
            print()
        
        print("="*80)
        
        # Also dump raw JSON for inspection
        print("\n📄 Raw JSON:")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    inspect_snapshot()
