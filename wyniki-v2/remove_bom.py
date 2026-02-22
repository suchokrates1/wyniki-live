import glob
import os

for filepath in glob.glob('frontend/**/*.html', recursive=True):
    # Skip node_modules
    if 'node_modules' in filepath:
        continue
    
    print(f'Processing: {filepath}')
    
    # Read with BOM handling
    with open(filepath, 'rb') as f:
        raw = f.read()
    
    # Remove BOM if present (EF BB BF)
    if raw.startswith(b'\xef\xbb\xbf'):
        raw = raw[3:]
        print(f'  Removed BOM from {filepath}')
    
    # Write without BOM
    with open(filepath, 'wb') as f:
        f.write(raw)
    
    print(f'✓ Fixed: {filepath}')

print('\nDone! All BOM markers removed.')
