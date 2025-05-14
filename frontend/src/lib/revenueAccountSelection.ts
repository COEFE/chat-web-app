import OpenAI from 'openai';
import { Account } from './accounting/accountQueries';

/**
 * Select the most appropriate revenue account using AI
 * @param lineDescription The description of the invoice line item
 * @param availableAccounts List of available revenue accounts to choose from
 * @returns The selected account or null if no accounts available
 */
export async function selectRevenueAccountWithAI(
  lineDescription: string, 
  availableAccounts: Account[]
): Promise<Account | null> {
  if (availableAccounts.length === 0) return null;
  
  // If only one account exists, just use it
  if (availableAccounts.length === 1) return availableAccounts[0];
  
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Ask AI to select the best revenue account based on the line description
    const prompt = `Given this invoice line item description: "${lineDescription}", 
      select the most appropriate revenue account from this list:
      ${availableAccounts.map(a => `- ${a.code}: ${a.name}`).join('\n')}
      
      Return only the account code of the best match.`;
    
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });
    
    const selectedCode = aiResponse.choices[0].message.content?.trim();
    
    if (selectedCode) {
      // Clean up the code if there's any extra characters
      const cleanCode = selectedCode.replace(/[^a-zA-Z0-9]/g, '');
      const selectedAccount = availableAccounts.find(a => a.code === cleanCode);
      
      if (selectedAccount) {
        console.log(`[revenueAccountSelection] AI selected revenue account ${selectedAccount.code} - ${selectedAccount.name} for line: ${lineDescription}`);
        return selectedAccount;
      }
    }
    
    console.log(`[revenueAccountSelection] AI couldn't select a revenue account, using default`);
    return availableAccounts[0]; // Fallback to first if AI selection fails
  } catch (error) {
    console.error('[revenueAccountSelection] Error selecting revenue account with AI:', error);
    return availableAccounts[0]; // Fallback on error
  }
}
