#!/usr/bin/env python3
"""
Complete SID Mapping Generator for VelocityDRIVE-SP Web Interface
Parses all 54 SID files from the coreconf directory and generates
a complete JavaScript mapping file for the web interface.
"""

import json
import os
import glob
from pathlib import Path

def parse_sid_file(filepath):
    """Parse a single SID file and extract SID mappings."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        mappings = {}
        module_name = data.get('module-name', 'unknown')
        
        for item in data.get('items', []):
            if item.get('namespace') == 'data':
                sid = item.get('sid')
                identifier = item.get('identifier', '')
                if sid and identifier:
                    mappings[sid] = identifier
        
        return mappings, module_name
    except Exception as e:
        print(f"Error parsing {filepath}: {e}")
        return {}, "error"

def generate_complete_mapping():
    """Generate complete SID mapping from all coreconf files."""
    
    # Path to coreconf directory
    coreconf_base = "/home/kim/Downloads/Microchip_VelocityDRIVE_CT-UI-linux-2025.07.12/resources/bin/wwwroot/downloads/coreconf"
    
    # Find the hash directory
    hash_dirs = glob.glob(os.path.join(coreconf_base, "*"))
    coreconf_dir = None
    for d in hash_dirs:
        if os.path.isdir(d):
            coreconf_dir = d
            break
    
    if not coreconf_dir:
        print("Could not find coreconf hash directory")
        return
    
    print(f"Processing SID files from: {coreconf_dir}")
    
    # Find all SID files
    sid_files = glob.glob(os.path.join(coreconf_dir, "*.sid"))
    print(f"Found {len(sid_files)} SID files")
    
    complete_mapping = {}
    module_stats = {}
    
    # Process each SID file
    for sid_file in sorted(sid_files):
        mappings, module_name = parse_sid_file(sid_file)
        complete_mapping.update(mappings)
        module_stats[module_name] = len(mappings)
        print(f"Processed {os.path.basename(sid_file)}: {len(mappings)} mappings")
    
    print(f"\nTotal mappings: {len(complete_mapping)}")
    print(f"Modules processed: {len(module_stats)}")
    
    # Generate JavaScript file
    js_content = """// Complete YANG SID Mapping for VelocityDRIVE-SP Web Interface
// Generated automatically from all coreconf SID files
// Total mappings: {total_mappings}
// Modules: {total_modules}

const yangSidMap = {{
{mappings}
}};

// Reverse mapping: YANG path to SID
const yangToSidMap = {{}};
for (const [sid, yangPath] of Object.entries(yangSidMap)) {{
    yangToSidMap[yangPath] = parseInt(sid);
}}

// Module statistics
const moduleStats = {module_stats};

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {{
    module.exports = {{ yangSidMap, yangToSidMap, moduleStats }};
}} else if (typeof window !== 'undefined') {{
    window.yangSidMap = yangSidMap;
    window.yangToSidMap = yangToSidMap;
    window.moduleStats = moduleStats;
}}

console.log('YANG SID mappings loaded:', Object.keys(yangSidMap).length, 'entries');
""".format(
        total_mappings=len(complete_mapping),
        total_modules=len(module_stats),
        mappings=',\n'.join(f'  {sid}: "{path}"' for sid, path in sorted(complete_mapping.items())),
        module_stats=json.dumps(module_stats, indent=2)
    )
    
    # Write the JavaScript file
    output_file = "/home/kim/velocitydrivesp-web-github/js/sid-mapping.js"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"\nGenerated complete SID mapping file: {output_file}")
    
    # Print some sample mappings
    print("\nSample mappings:")
    for i, (sid, path) in enumerate(sorted(complete_mapping.items())[:10]):
        print(f"  {sid}: {path}")
    
    print("\nModule statistics:")
    for module, count in sorted(module_stats.items()):
        if count > 0:
            print(f"  {module}: {count} mappings")

if __name__ == "__main__":
    generate_complete_mapping()