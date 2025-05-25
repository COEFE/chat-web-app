#!/usr/bin/env python3

# Read the file
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'r') as f:
    content = f.read()

# Split into lines
lines = content.split('\n')

# Print current line 6964 (0-indexed: 6963)
print(f"Line 6964 before: '{lines[6963]}'")

# Fix line 6964 - replace statementInfo with query
if 'statementInfo' in lines[6963]:
    lines[6963] = lines[6963].replace('statementInfo', 'query')
    print(f"Line 6964 after: '{lines[6963]}'")
else:
    print("No change needed for line 6964")

# Write back
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'w') as f:
    f.write('\n'.join(lines))

print("Done!")
