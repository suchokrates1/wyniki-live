#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix corrupted Polish characters in admin.html"""

# Mapping of corrupted chars to correct ones
mapping = {
    'ÔÜí': '⚙',
    '┼é': 'ł',
    '├│': 'ó', 
    '─ç': 'ć',
    '─ů': 'ą',
    '┼╝': 'ż',
    '┼ä': 'ń',
    '┼Ü': 'ś',
    '┼║': 'ź',
    'Ôöé': '—',
    'Ôö║': '–',
    'ÔÇö': '—',
    'bĘdą': 'będą',
    'bĘ': 'bę',
    'Ę': 'ę',
    'listĘ': 'listę',
    'usługĘ': 'usługę',
    'dostĘp': 'dostęp',
    'DostĘp': 'Dostęp',
    'nastĘpnie': 'następnie',
    'konfiguracjĘ': 'konfigurację',
    'ImiĘ': 'Imię',
    '┼Ť': 'ś',
    'Od┼Ťwież': 'Odśwież',
    'od┼Ťwie': 'odświe',
    'ÔŚĆ': '●',
    'Ôçů': '↕',
    '┼Ä': 'Ł',
    '├ô': 'Ó',
    '─å': 'Ć',
    '─ö': 'Ą',
    '┼╗': 'Ż',
    '┼Ä': 'Ń',
    '┼Ü': 'Ś',
    '┼╣': 'Ź',
    '─Ö': 'ę',
    '─Ö': 'Ę',
}

def fix_file(filename):
    """Fix Polish characters in a file"""
    with open(filename, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    original_len = len(content)
    
    for bad, good in mapping.items():
        content = content.replace(bad, good)
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✓ Fixed {filename} ({original_len} chars)")

if __name__ == '__main__':
    files = ['admin.html', 'static/js/admin.js']
    
    for f in files:
        try:
            fix_file(f)
        except Exception as e:
            print(f"✗ Error fixing {f}: {e}")
