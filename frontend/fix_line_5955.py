#!/usr/bin/env python3

# Read the file
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'r') as f:
    content = f.read()

# Split into lines
lines = content.split('\n')

# Print current line 5955 (0-indexed: 5954)
print(f"Line 5955 before: '{lines[5954]}'")

# Fix line 5955 - replace statementInfo with query
if 'statementInfo' in lines[5954]:
    lines[5954] = lines[5954].replace('statementInfo', 'query')
    print(f"Line 5955 after: '{lines[5954]}'")
else:
    print("No change needed for line 5955")

# Write back
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'w') as f:
    f.write('\n'.join(lines))

print("Done!")
