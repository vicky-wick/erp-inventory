-- Cast enum literals in return_sale final UPDATE
create or replace function return_sale(
  p_workspace_id uuid,
  p_sale_id      uuid,
  p_items        jsonb,
  p_reason       text
) returns jsonb as $$
declare
  v_item      jsonb;
  v_si        record;
  v_return_qty integer;
  v_any_return boolean := false;
  v_all_returned boolean := true;
begin
  select * into v_si from sales
   where id = p_sale_id and workspace_id = p_workspace_id
   for update;

  if v_si.id is null then
    raise exception 'SALE_NOT_FOUND';
  end if;
  if v_si.status = 'cancelled' then
    raise exception 'SALE_CANCELLED';
  end if;
  if v_si.status = 'returned' then
    raise exception 'SALE_ALREADY_RETURNED';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_si from sale_items
     where id = (v_item->>'item_id')::uuid
       and sale_id = p_sale_id and workspace_id = p_workspace_id
     for update;

    if v_si.id is null then
      raise exception 'SALE_ITEM_NOT_FOUND: %', v_item->>'item_id';
    end if;

    if (v_item->>'quantity') is null then
      v_return_qty := v_si.quantity - v_si.returned_qty; -- return all remaining
    else
      v_return_qty := (v_item->>'quantity')::integer;
    end if;

    if v_return_qty <= 0 or v_si.returned_qty + v_return_qty > v_si.quantity then
      raise exception 'INVALID_RETURN_QTY: item % remaining %', v_si.id, v_si.quantity - v_si.returned_qty;
    end if;

    update sale_items set returned_qty = returned_qty + v_return_qty where id = v_si.id;

    perform apply_stock_change(
      p_workspace_id, v_si.product_id, v_si.variant_id,
      'sale_returned', v_return_qty,
      'sale', p_sale_id, p_reason, null, true
    );

    v_any_return := true;
    if v_si.returned_qty + v_return_qty < v_si.quantity then
      v_all_returned := false;
    end if;
  end loop;

  if not v_any_return then
    raise exception 'EMPTY_RETURN';
  end if;

  update sales
     set status = case when v_all_returned then 'returned'::sale_status else 'partially_returned'::sale_status end,
         payment_status = case when v_all_returned then 'refunded'::payment_status else 'partially_refunded'::payment_status end
   where id = p_sale_id;

  return jsonb_build_object('sale_id', p_sale_id, 'status', case when v_all_returned then 'returned' else 'partially_returned' end);
end;
$$ language plpgsql;


