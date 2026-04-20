# Security Specification: Fortress Rules

## 1. Data Invariants
- A `Transaction` requires a `branchId` that matches the employee's `branchId`.
- An `InventoryItem` can never have `stock < 0`.
- Serial Numbers (SN) in `InventoryItem` must be unique across the system for that branch/productId.
- Users cannot elevate their own `role` or `isApproved` status.

## 2. The "Dirty Dozen" Payloads (Examples)
1. **Unapproved Employee Transaction**: Create a transaction while `isApproved == false`.
2. **Stock Poisoning**: Update `InventoryItem` with `stock: -100`.
3. **Role Hijack**: Update `User` record to set `role: 'admin'` while being an `employee`.
4. **ID Injection**: `branches/evil_branch_id_with_too_many_characters_################################################################################################################################################################################################################################################################################/inventory/item1`.
5. **Ghost Inventory**: Create `InventoryItem` without a valid `productId`.
6. **Price Manipulation**: Create `Transaction` with `totalAmount: 0` for high-value items.
7. **PII Isolation Breach**: Read `User` document of another branch when not an admin/audit.
8. **Orphaned Write**: Create `Transaction` with a `branchId` that does not exist.
9. **Mutation Override**: Attempt to change `createdAt` timestamp of a `Transaction`.
10. **Shadow Update (Field Injection)**: Update `User` with `{"isApproved": true, "extraField": "malicious"}`.
11. **Negative Profit**: Create `Transaction` where `totalProfit` is a large negative number.
12. **Terminal State Manipulation**: Update a `StockTransfer` that is already `completed`.

## 3. Test Runner (Summary of firestore.rules.test.ts)
- Assert `PERMISSION_DENIED` for all Dirty Dozen payloads.
- Assert `PERMISSION_GRANTED` for valid CRUD operations by employees/admins in authorized branches.
