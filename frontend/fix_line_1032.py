#!/usr/bin/env python3

# Read the file
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'r') as f:
    content = f.read()

# Split into lines
lines = content.split('\n')

# Print current line 1032 (0-indexed: 1031)
print(f"Line 1032 before: '{lines[1031]}'")

# Fix line 1032 - replace statementInfo, with processableStatementInfo,
if 'statementInfo,' in lines[1031]:
    lines[1031] = lines[1031].replace('statementInfo,', 'processableStatementInfo,')
    print(f"Line 1032 after: '{lines[1031]}'")
else:
    print("No change needed for line 1032")

# Write back
with open('/Users/christopherealy/Desktop/code/chat-web-app/frontend/src/lib/agents/creditCardAgent.ts', 'w') as f:
    f.write('\n'.join(lines))

print("Done!")
