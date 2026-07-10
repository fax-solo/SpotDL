"""add token_blacklist table

Revision ID: 1e7a3b2c4d5e
Revises: b18f3e8742a7
Create Date: 2026-07-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1e7a3b2c4d5e'
down_revision: Union[str, Sequence[str], None] = 'b18f3e8742a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('token_blacklist',
        sa.Column('jti', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.BigInteger(), nullable=False),
        sa.PrimaryKeyConstraint('jti')
    )
    op.create_index(op.f('ix_token_blacklist_expires_at'), 'token_blacklist', ['expires_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_token_blacklist_expires_at'), table_name='token_blacklist')
    op.drop_table('token_blacklist')
