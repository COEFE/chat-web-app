import OpenAI from 'openai';
import { Customer } from './accounting/customerQueries';

/**
 * Use AI to find the most relevant customer based on name
 * @param queryName The customer name from the user's query
 * @param existingCustomers List of customers from the database
 * @returns The best matching customer or null if no good match
 */
export async function findCustomerWithAI(
  queryName: string, 
  existingCustomers: Customer[]
): Promise<Customer | null> {
  if (existingCustomers.length === 0) return null;
  
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Ask AI to find the best customer match
    const prompt = `Given this customer name from a user query: "${queryName}", 
      find the best matching customer from this list:
      ${existingCustomers.map(c => `- ID: ${c.id}, Name: ${c.name}, Email: ${c.email || 'N/A'}`).join('\n')}
      
      If there's a good match, return only the customer ID.
      If there is no good match, return "NO_MATCH".`;
    
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });
    
    const selection = aiResponse.choices[0].message.content?.trim();
    
    if (selection && selection !== "NO_MATCH") {
      // Try to parse the customer ID from the AI response
      const idMatch = selection.match(/\d+/);
      if (idMatch) {
        const customerId = parseInt(idMatch[0]);
        const selectedCustomer = existingCustomers.find(c => c.id === customerId);
        
        if (selectedCustomer) {
          console.log(`[customerSelection] AI matched "${queryName}" to customer: ${selectedCustomer.name} (ID: ${selectedCustomer.id})`);
          return selectedCustomer;
        }
      }
    }
    
    console.log(`[customerSelection] AI couldn't find a good match for "${queryName}"`);
    return null;
  } catch (error) {
    console.error('[customerSelection] Error finding customer with AI:', error);
    return null;
  }
}
