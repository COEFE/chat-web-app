#!/usr/bin/env python3

# Read the file
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'r') as f:
    content = f.read()

# Split into lines
lines = content.split('\n')

# Print current line 5896 (0-indexed: 5895)
print(f"Line 5896 before: '{lines[5895]}'")

# Fix line 5896 - replace statementInfo with query
if 'statementInfo' in lines[5895]:
    lines[5895] = lines[5895].replace('statementInfo', 'query')
    print(f"Line 5896 after: '{lines[5895]}'")
else:
    print("No change needed for line 5896")

# Write back
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'w') as f:
    f.write('\n'.join(lines))

print("Done!")
