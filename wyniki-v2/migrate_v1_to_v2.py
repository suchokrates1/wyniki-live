#!/usr/bin/env python3
"""
Migrate v1 database structure to v2.
Adds missing columns and creates default tournament.
"""
import sqlite3
import sys
from datetime import datetime

def migrate_database(db_path):
    """Migrate v1 database to v2 structure."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Migrating database: {db_path}")
    
    # 1. Create tournaments table if not exists
    print("Creating tournaments table...")
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            active INTEGER DEFAULT 0,
            created_at TEXT
        )
    ''')
    
    # 2. Check if default tournament exists
    cursor.execute("SELECT COUNT(*) FROM tournaments WHERE id = 1")
    if cursor.fetchone()[0] == 0:
        print("Creating default tournament...")
        cursor.execute('''
            INSERT INTO tournaments (id, name, start_date, end_date, active, created_at)
            VALUES (1, 'Default Tournament', ?, ?, 1, ?)
        ''', (
            datetime.now().strftime('%Y-%m-%d'),
            '2099-12-31',
            datetime.utcnow().isoformat()
        ))
    
    # 3. Check players table structure
    cursor.execute("PRAGMA table_info(players)")
    columns = {row[1] for row in cursor.fetchall()}
    print(f"Current players columns: {columns}")
    
    # 4. Add missing columns to players table
    if 'tournament_id' not in columns:
        print("Adding tournament_id column...")
        cursor.execute('ALTER TABLE players ADD COLUMN tournament_id INTEGER DEFAULT 1')
    
    if 'category' not in columns:
        print("Adding category column...")
        cursor.execute('ALTER TABLE players ADD COLUMN category TEXT')
        # Try to copy from group_category if exists
        if 'group_category' in columns:
            cursor.execute('UPDATE players SET category = group_category')
    
    if 'country' not in columns:
        print("Adding country column...")
        cursor.execute('ALTER TABLE players ADD COLUMN country TEXT')
        # Try to copy from flag_code if exists
        if 'flag_code' in columns:
            cursor.execute('UPDATE players SET country = flag_code')
    
    if 'created_at' not in columns:
        print("Adding created_at column...")
        cursor.execute('ALTER TABLE players ADD COLUMN created_at TEXT')
    
    # 5. Update all players to belong to default tournament
    print("Assigning players to default tournament...")
    cursor.execute('UPDATE players SET tournament_id = 1 WHERE tournament_id IS NULL')
    
    # 6. Migrate courts table
    cursor.execute("PRAGMA table_info(courts)")
    court_columns = {row[1] for row in cursor.fetchall()}
    print(f"Current courts columns: {court_columns}")
    
    if 'active' not in court_columns:
        print("Adding active column to courts...")
        cursor.execute('ALTER TABLE courts ADD COLUMN active INTEGER DEFAULT 1')
    
    # 7. Count players and courts
    cursor.execute('SELECT COUNT(*) FROM players')
    player_count = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(*) FROM courts')
    court_count = cursor.fetchone()[0]
    print(f"Total players migrated: {player_count}")
    print(f"Total courts migrated: {court_count}")
    
    conn.commit()
    conn.close()
    
    print("✅ Migration completed successfully!")
    return player_count

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python migrate_v1_to_v2.py <database_path>")
        sys.exit(1)
    
    db_path = sys.argv[1]
    try:
        migrate_database(db_path)
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)
