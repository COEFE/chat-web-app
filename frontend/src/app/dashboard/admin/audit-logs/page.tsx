"use client";

import { useState, useEffect } from "react";
import { getAuditLogs } from "@/lib/auditLogger";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { format } from "date-fns";
import { Search, Eye } from "lucide-react";


export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  
  // Filters
  const [userId, setUserId] = useState("");
  const [actionType, setActionType] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [entityId, setEntityId] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [status, setStatus] = useState("all");

  // Common action types for the dropdown
  const actionTypes = [
    "INVOICE_CREATED",
    "INVOICE_UPDATED",
    "INVOICE_DELETED",
    "BILL_CREATED",
    "BILL_UPDATED",
    "BILL_DELETED",
    "BILL_PAYMENT_CREATED",
    "BILL_PAYMENT_DELETED",
    "VENDOR_CREATED",
    "VENDOR_UPDATED",
    "VENDOR_DELETED",
    "USER_LOGIN",
    "USER_LOGOUT"
  ];

  // Common entity types for the dropdown
  const entityTypes = [
    "Invoice",
    "Bill",
    "BillPayment",
    "Vendor",
    "User",
    "Account"
  ];

  // Status options
  const statusOptions = [
    "SUCCESS",
    "FAILURE",
    "ATTEMPT"
  ];

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { logs: fetchedLogs, total: totalLogs } = await getAuditLogs({
        userId: userId || undefined,
        actionType: actionType === 'all' ? undefined : actionType,
        entityType: entityType === 'all' ? undefined : entityType,
        entityId: entityId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: status === 'all' ? undefined : status,
        page,
        limit
      });

      setLogs(fetchedLogs);
      setTotal(totalLogs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit]);

  const handleSearch = () => {
    setPage(1); // Reset to first page when applying new filters
    fetchLogs();
  };

  const handleClearFilters = () => {
    setUserId("");
    setActionType("all");
    setEntityType("all");
    setEntityId("");
    setStartDate("");
    setEndDate("");
    setStatus("all");
    setPage(1);
    fetchLogs();
  };

  // Format the timestamp to a more readable format
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };

  // Toggle expanded log details
  const toggleExpandLog = (id: number) => {
    if (expandedLogId === id) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(id);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Audit Logs</CardTitle>
          <CardDescription>
            View and search the system audit trail for activity across the application
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters Section */}
          <div className="mb-6 space-y-4">
            <h3 className="text-lg font-medium">Filters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">User ID</label>
                <Input 
                  placeholder="User ID" 
                  value={userId} 
                  onChange={(e) => setUserId(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Action Type</label>
                <Select value={actionType} onValueChange={setActionType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select action type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Actions</SelectItem>
                    {actionTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Entity Type</label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select entity type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Entities</SelectItem>
                    {entityTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Entity ID</label>
                <Input 
                  placeholder="Entity ID" 
                  value={entityId} 
                  onChange={(e) => setEntityId(e.target.value)} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Input 
                  type="date" 
                  value={endDate} 
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statusOptions.map((statusOption) => (
                      <SelectItem key={statusOption} value={statusOption}>{statusOption}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleSearch} className="ml-auto">
                <Search className="h-4 w-4 mr-2" /> Apply Filters
              </Button>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            </div>
          </div>

          {/* Audit Logs Table */}
          {loading ? (
            <div className="text-center p-8">Loading audit logs...</div>
          ) : logs.length > 0 ? (
            <>
              <Table>
                <TableCaption>A list of audit logs in the system</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <>
                      <TableRow key={log.id}>
                        <TableCell>{formatTimestamp(log.timestamp)}</TableCell>
                        <TableCell className="max-w-[120px] truncate">
                          {log.user_id || "System"}
                        </TableCell>
                        <TableCell>{log.action_type}</TableCell>
                        <TableCell>
                          {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ""}
                        </TableCell>
                        <TableCell className={log.status === 'SUCCESS' ? 'text-green-600' : log.status === 'FAILURE' ? 'text-red-600' : ''}>
                          {log.status}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => toggleExpandLog(log.id)}
                          >
                            <Eye className="h-4 w-4 mr-2" /> 
                            {expandedLogId === log.id ? 'Hide Details' : 'View Details'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedLogId === log.id && (
                        <TableRow>
                          <TableCell colSpan={6} className="p-4 bg-slate-50">
                            <div className="space-y-4">
                              {log.changes_made && log.changes_made.length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="font-semibold">Changes:</h4>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Field</TableHead>
                                        <TableHead>Previous Value</TableHead>
                                        <TableHead>New Value</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {log.changes_made.map((change: any, index: number) => (
                                        <TableRow key={`change-${index}`}>
                                          <TableCell>{change.field}</TableCell>
                                          <TableCell>
                                            {change.old_value !== null && change.old_value !== undefined 
                                              ? String(change.old_value) 
                                              : "(empty)"}
                                          </TableCell>
                                          <TableCell>
                                            {change.new_value !== null && change.new_value !== undefined 
                                              ? String(change.new_value) 
                                              : "(empty)"}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                              
                              {log.context && Object.keys(log.context).length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="font-semibold">Context:</h4>
                                  <div className="bg-slate-100 p-3 rounded-md">
                                    <pre className="text-sm whitespace-pre-wrap">
                                      {JSON.stringify(log.context, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {log.error_details && (
                                <div className="space-y-2">
                                  <h4 className="font-semibold">Error:</h4>
                                  <div className="text-red-500 p-3 bg-red-50 rounded-md">
                                    {log.error_details}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>

              {/* Simple Pagination */}
              <div className="mt-6 flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                  Showing {logs.length} of {total} logs
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPage(page > 1 ? page - 1 : 1)}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center px-3 text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPage(page < totalPages ? page + 1 : totalPages)}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center p-8">
              No audit logs found. Try adjusting your filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
