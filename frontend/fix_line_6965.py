#!/usr/bin/env python3

# Read the file
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'r') as f:
    content = f.read()

# Split into lines
lines = content.split('\n')

# Print current line 6965 (0-indexed: 6964)
print(f"Line 6965 before: '{lines[6964]}'")

# Fix line 6965 - replace statementInfo with query
if 'statementInfo' in lines[6964]:
    lines[6964] = lines[6964].replace('statementInfo', 'query')
    print(f"Line 6965 after: '{lines[6964]}'")
else:
    print("No change needed for line 6965")

# Write back
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'w') as f:
    f.write('\n'.join(lines))

print("Done!")
