-- Ensure system container Box -1 exists for wishlisted comics (satisfies comic_books.current_box_id FK)
INSERT INTO storage_boxes (id, name, location, max_capacity, color_tag, notes)
VALUES (-1, 'Box -1: Wishlist', 'Unassigned', 9999, '#f43f5e', 'System container for wishlisted comics')
ON CONFLICT (id) DO NOTHING;
